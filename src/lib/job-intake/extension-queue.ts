import type { Queue, Worker } from 'bunqueue/client'
import { and, eq, inArray, isNotNull } from 'drizzle-orm'
import { createAnalysisWorkflow } from '../../db/analysis-workflows'
import { db } from '../../db/client'
import { prepareExtensionItem, updateExtensionItem } from '../../db/extension-intake'
import { jobIntakeItems } from '../../db/schema'
import { analysisQueuePath, dispatchAnalysisWorkflows } from '../analysis/workflow'
import { IntakeError, terminalStatuses } from './contracts'

/** Prepare source identity once, then hand execution to the shared workflow. */
export function submitExtensionItem(itemId: number) {
  try {
    return db.transaction(() => {
      const row = db.select().from(jobIntakeItems).where(eq(jobIntakeItems.id, itemId)).get()
      if (!row || terminalStatuses.includes(row.pipelineStatus ?? '')) return
      const item = prepareExtensionItem(itemId)
      return createAnalysisWorkflow({
        sourceKey: `intake-item:${itemId}`,
        mode: 'job-and-candidate',
        intakeItemId: itemId,
        jobApplicationId: item.jobApplicationId,
        jobPostingId: item.jobPostingId,
        jobAnalysisRunId: item.jobAnalysisRunId,
        candidateAnalysisRunId: item.candidateAnalysisRunId,
      })
    })
  } catch (error) {
    if (error instanceof IntakeError)
      updateExtensionItem(itemId, {
        pipelineStatus: 'failed',
        stage: 'done',
        errorCode: error.code,
        errorMessage: error.message,
      })
    else console.error('Intake submission deferred to recovery', itemId, error)
  }
}

/** Accepted rows remain an outbox until a workflow has been durably submitted. */
export async function dispatchExtensionIntake() {
  const rows = db
    .select()
    .from(jobIntakeItems)
    .where(
      and(
        isNotNull(jobIntakeItems.pipelineStatus),
        inArray(jobIntakeItems.pipelineStatus, ['accepted', 'queued', 'processing']),
      ),
    )
    .all()
  for (const row of rows) submitExtensionItem(row.id)
  await dispatchAnalysisWorkflows()
}

// URL fetching is independent of the analysis workflow. It still uses the
// existing bounded intake queue; only its subsequent analysis uses the Engine.
let legacyQueue: Promise<Queue<{ itemId: number }>> | undefined
let legacyWorker: Worker<{ itemId: number }> | undefined
export async function enqueueLegacyIntake(itemId: number) {
  if (process.env.NODE_ENV !== 'production') {
    void (await import('./queue'))
      .processJobIntakeItem(itemId)
      .catch(() => console.error('Legacy intake failed', itemId))
    return
  }
  legacyQueue ??= (async () => {
    const { Queue, Worker } = await import('bunqueue/client')
    const queue = new Queue<{ itemId: number }>('legacy-intake-v2', {
      embedded: true,
      dataPath: analysisQueuePath(),
    })
    legacyWorker = new Worker<{ itemId: number }>(
      'legacy-intake-v2',
      async (job) => (await import('./queue')).processJobIntakeItem(job.data.itemId),
      { embedded: true, dataPath: analysisQueuePath(), concurrency: 3, heartbeatInterval: 10_000 },
    )
    legacyWorker.on('error', (error) => console.error('Intake queue error', error))
    return queue
  })()
  await (await legacyQueue).add(
    'legacy-intake',
    { itemId },
    {
      jobId: `legacy-intake-${itemId}`,
      attempts: 1,
      durable: true,
      timeout: 120_000,
    },
  )
}
