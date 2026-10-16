import type { Queue, Worker } from 'bunqueue/client'
import { and, eq, isNotNull, isNull, lt, lte, or } from 'drizzle-orm'
import { failAnalysisRun } from '../../db/analysis'
import { db } from '../../db/client'
import {
  extensionBatchStatus,
  getExtensionRun,
  prepareExtensionItem,
  updateExtensionItem,
} from '../../db/extension-intake'
import { failJobAnalysisRun } from '../../db/job-analysis-runs'
import { jobIntakeItems } from '../../db/schema'
import { IntakeError, terminalStatuses } from './contracts'

type Work = { itemId: number; legacy?: boolean }
let queue: Queue<Work> | undefined
let worker: Worker<Work> | undefined
let dispatching = false
const processing = new Set<number>()
const queuePath = () =>
  process.env.QUEUE_FILE_NAME ??
  process.env.BUNQUEUE_DATA_PATH ??
  `${process.cwd().endsWith('/dist') ? '../' : ''}bunqueue.db`

export type IntakeDispatchers = {
  job: (
    postingId: number,
    persisted: (run: { id: number }) => void,
    runId?: number,
  ) => Promise<unknown>
  candidate: (
    applicationId: number,
    persisted: (run: { id: number }) => void,
    runId?: number,
  ) => Promise<unknown>
}
const dispatchers: IntakeDispatchers = {
  job: async (id, persisted, runId) => {
    const module = await import('../job-analysis/queue')
    return runId ? module.dispatchJobAnalysisRun(runId) : module.enqueueJobAnalysis(id, persisted)
  },
  candidate: async (id, persisted, runId) => {
    const module = await import('../analysis/queue')
    return runId
      ? module.dispatchCandidateAnalysisRun(runId)
      : module.enqueueCandidateAnalysis(id, persisted)
  },
}

/** One short orchestration step. No worker sits waiting for a child model request. */
export async function advanceExtensionItem(
  itemId: number,
  enqueue: IntakeDispatchers = dispatchers,
) {
  if (processing.has(itemId)) return
  processing.add(itemId)
  let ownsClaim = false
  try {
    const claimed = db
      .update(jobIntakeItems)
      .set({ claimedAt: Date.now() })
      .where(
        and(
          eq(jobIntakeItems.id, itemId),
          or(isNull(jobIntakeItems.claimedAt), lt(jobIntakeItems.claimedAt, Date.now() - 60_000)),
        ),
      )
      .returning()
      .get()
    if (!claimed) return
    ownsClaim = true
    if (terminalStatuses.includes(claimed.pipelineStatus ?? '')) return
    let item = prepareExtensionItem(itemId)
    if (item.pipelineStatus === 'duplicate') return
    if (!item.jobPostingId || !item.jobApplicationId)
      throw new IntakeError('missing-posting', 'The intake source no longer exists.')
    if (!item.jobAnalysisRunId) {
      await enqueue.job(item.jobPostingId, (run) =>
        updateExtensionItem(itemId, {
          jobAnalysisRunId: run.id,
          pipelineStatus: 'processing',
          stage: 'job-analysis',
        }),
      )
      return
    }
    const jobRun = getExtensionRun('job-analysis', item.jobAnalysisRunId)
    if (!jobRun || jobRun.status === 'Failed')
      throw new IntakeError(
        'job-analysis-failed',
        'Job analysis failed. Open the application to retry.',
      )
    if (
      jobRun.status === 'Processing' &&
      jobRun.startedAt &&
      Date.now() - Date.parse(jobRun.startedAt) > 15 * 60_000
    ) {
      failJobAnalysisRun(db, jobRun.id, new Error('Analysis worker timed out. Retry explicitly.'))
      throw new IntakeError(
        'analysis-timeout',
        'The analysis worker stopped responding. Open the application to retry.',
      )
    }
    if (jobRun.status === 'Queued') {
      await enqueue.job(item.jobPostingId, () => undefined, item.jobAnalysisRunId)
      return
    }
    if (jobRun.status !== 'Completed') return
    if (!item.candidateAnalysisRunId) {
      updateExtensionItem(itemId, { stage: 'candidate-analysis' })
      await enqueue.candidate(item.jobApplicationId, (run) =>
        updateExtensionItem(itemId, {
          candidateAnalysisRunId: run.id,
          stage: 'candidate-analysis',
        }),
      )
      item = db.select().from(jobIntakeItems).where(eq(jobIntakeItems.id, itemId)).get()!
      if (!item.candidateAnalysisRunId)
        throw new IntakeError('candidate-unavailable', 'Candidate analysis could not be started.')
      return
    }
    const candidateRun = getExtensionRun('candidate-analysis', item.candidateAnalysisRunId)
    if (!candidateRun || candidateRun.status === 'Failed')
      throw new IntakeError(
        'candidate-analysis-failed',
        'Candidate analysis failed. Open the application to retry.',
      )
    if (
      candidateRun.status === 'Processing' &&
      candidateRun.startedAt &&
      Date.now() - Date.parse(candidateRun.startedAt) > 15 * 60_000
    ) {
      failAnalysisRun(candidateRun.id, new Error('Analysis worker timed out. Retry explicitly.'))
      throw new IntakeError(
        'analysis-timeout',
        'The candidate worker stopped responding. Open the application to retry.',
      )
    }
    if (candidateRun.status === 'Queued') {
      await enqueue.candidate(item.jobApplicationId, () => undefined, item.candidateAnalysisRunId)
      return
    }
    if (candidateRun.status === 'Completed')
      updateExtensionItem(itemId, {
        pipelineStatus: 'completed',
        stage: 'done',
        status: 'ready',
        errorCode: null,
        errorMessage: null,
      })
  } catch (error) {
    const row = db.select().from(jobIntakeItems).where(eq(jobIntakeItems.id, itemId)).get()
    if (!row) return
    const final = error instanceof IntakeError || row.attempts >= 3
    updateExtensionItem(itemId, {
      pipelineStatus: final ? 'failed' : 'queued',
      stage: final ? 'done' : row.stage,
      attempts: row.attempts + 1,
      errorCode: error instanceof IntakeError ? error.code : 'dispatch-unavailable',
      errorMessage:
        error instanceof IntakeError
          ? error.message
          : 'Analysis dispatch is temporarily unavailable.',
    })
  } finally {
    if (ownsClaim)
      db.update(jobIntakeItems)
        .set({ claimedAt: null, nextDispatchAt: Date.now() + 10_000 })
        .where(eq(jobIntakeItems.id, itemId))
        .run()
    processing.delete(itemId)
    const row = db.select().from(jobIntakeItems).where(eq(jobIntakeItems.id, itemId)).get()
    if (row) extensionBatchStatus(row.batchId)
  }
}

async function persistentQueue() {
  if (process.env.NODE_ENV !== 'production') return null
  if (queue) return queue
  const bunqueue = await import('bunqueue/client')
  if (queue) return queue
  queue = new bunqueue.Queue<Work>('extension-intake', { embedded: true, dataPath: queuePath() })
  worker = new bunqueue.Worker<Work>(
    'extension-intake',
    async (job) =>
      job.data.legacy
        ? (await import('./queue')).processJobIntakeItem(job.data.itemId)
        : advanceExtensionItem(job.data.itemId),
    {
      embedded: true,
      dataPath: queuePath(),
      concurrency: 3,
      heartbeatInterval: 10_000,
    },
  )
  worker.on('error', (error) =>
    console.error('Intake queue error', error instanceof Error ? error.name : 'UnknownError'),
  )
  return queue
}

/** DB-backed outbox reconciles both enqueue crash windows and child stage completion. */
export async function dispatchExtensionIntake() {
  if (dispatching) return
  dispatching = true
  try {
    const rows = db
      .select()
      .from(jobIntakeItems)
      .where(
        and(
          isNotNull(jobIntakeItems.pipelineStatus),
          or(
            eq(jobIntakeItems.pipelineStatus, 'accepted'),
            eq(jobIntakeItems.pipelineStatus, 'queued'),
            eq(jobIntakeItems.pipelineStatus, 'processing'),
          ),
          lte(jobIntakeItems.nextDispatchAt, Date.now()),
        ),
      )
      .limit(100)
      .all()
    const persistent = await persistentQueue()
    for (const row of rows) {
      if (persistent) {
        // Reconciliation jobs are disposable; persisted stage/run IDs own idempotence.
        await persistent.add(
          'advance',
          { itemId: row.id },
          {
            jobId: `intake-${row.id}-${Math.floor(Date.now() / 10_000)}`,
            durable: true,
            attempts: 1,
            timeout: 30_000,
            removeOnComplete: true,
          },
        )
        db.update(jobIntakeItems)
          .set({ nextDispatchAt: Date.now() + 10_000 })
          .where(eq(jobIntakeItems.id, row.id))
          .run()
      } else {
        await advanceExtensionItem(row.id)
      }
    }
  } finally {
    dispatching = false
  }
}

export function startExtensionIntakeRecovery() {
  void dispatchExtensionIntake().catch(() => console.error('Intake dispatch deferred to recovery.'))
  const timer = setInterval(() => {
    void dispatchExtensionIntake().catch(() =>
      console.error('Intake dispatch deferred to recovery.'),
    )
  }, 10_000)
  timer.unref()
  return timer
}

export async function enqueueLegacyIntake(itemId: number) {
  const persistent = await persistentQueue()
  if (persistent)
    await persistent.add(
      'legacy-intake',
      { itemId, legacy: true },
      { jobId: `legacy-intake-${itemId}`, attempts: 1, durable: true, timeout: 120_000 },
    )
  else
    void (await import('./queue'))
      .processJobIntakeItem(itemId)
      .catch(() => console.error('Legacy intake failed', itemId))
}
