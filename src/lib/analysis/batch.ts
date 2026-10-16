import { and, desc, eq, inArray } from 'drizzle-orm'
import { getAnalysisRun } from '../../db/analysis'
import { db } from '../../db/client'
import { getJobAnalysisRun, getJobAnalysisState } from '../../db/job-analysis-runs'
import {
  applicationAnalysisRuns,
  batchAnalysisItems,
  companies,
  jobApplications,
  jobIntakeItems,
  jobPostingAnalyses,
  jobPostings,
} from '../../db/schema'
import { currentJobAnalysisHash } from '../job-analysis/input'
import { batchAnalysisRequestSchema } from './batch-contract'

const activeStatuses = ['queued', 'job-analysis', 'candidate-analysis'] as const
const inflight = ['Queued', 'Processing'] as const

function latestPosting(applicationId: number) {
  return db
    .select()
    .from(jobPostings)
    .where(eq(jobPostings.jobApplicationId, applicationId))
    .orderBy(desc(jobPostings.version))
    .get()
}

function currentJobRun(postingId: number) {
  return getJobAnalysisState(db, postingId, currentJobAnalysisHash(db, postingId)).currentCompleted
}

export function latestAnalysisBatchId() {
  return db
    .select({ batchId: batchAnalysisItems.batchId })
    .from(batchAnalysisItems)
    .orderBy(desc(batchAnalysisItems.id))
    .get()?.batchId
}

export function listBatchAnalysisItems(batchId: string) {
  return db
    .select()
    .from(batchAnalysisItems)
    .where(eq(batchAnalysisItems.batchId, batchId))
    .orderBy(batchAnalysisItems.id)
    .all()
}

/** Persist the whole request before any paid work. Invalid items do not block valid ones. */
export function createAnalysisBatch(input: unknown) {
  const parsed = batchAnalysisRequestSchema.parse(input)
  const batchId = crypto.randomUUID()
  const now = new Date().toISOString()
  db.transaction(() => {
    for (const applicationId of new Set(parsed.applicationIds)) {
      const application = db
        .select({ title: jobApplications.jobTitle, company: companies.name })
        .from(jobApplications)
        .innerJoin(companies, eq(companies.id, jobApplications.companyId))
        .where(eq(jobApplications.id, applicationId))
        .get()
      const posting = latestPosting(applicationId)
      const activeBatch = db
        .select({ id: batchAnalysisItems.id })
        .from(batchAnalysisItems)
        .where(
          and(
            eq(batchAnalysisItems.jobApplicationId, applicationId),
            inArray(batchAnalysisItems.status, [...activeStatuses]),
          ),
        )
        .get()
      const activeJob =
        posting &&
        db
          .select({ id: jobPostingAnalyses.id })
          .from(jobPostingAnalyses)
          .where(
            and(
              eq(jobPostingAnalyses.jobPostingId, posting.id),
              inArray(jobPostingAnalyses.status, [...inflight]),
            ),
          )
          .get()
      const activeCandidate = db
        .select({ id: applicationAnalysisRuns.id })
        .from(applicationAnalysisRuns)
        .innerJoin(
          jobPostingAnalyses,
          eq(applicationAnalysisRuns.jobPostingAnalysisId, jobPostingAnalyses.id),
        )
        .innerJoin(jobPostings, eq(jobPostings.id, jobPostingAnalyses.jobPostingId))
        .where(
          and(
            eq(jobPostings.jobApplicationId, applicationId),
            inArray(applicationAnalysisRuns.status, [...inflight]),
          ),
        )
        .get()
      const activeIntake = db
        .select({ id: jobIntakeItems.id })
        .from(jobIntakeItems)
        .where(
          and(
            eq(jobIntakeItems.jobApplicationId, applicationId),
            inArray(jobIntakeItems.pipelineStatus, ['accepted', 'queued', 'processing']),
          ),
        )
        .get()
      const reason = !application
        ? 'Application not found.'
        : !posting?.rawText.trim()
          ? 'No saved job post text. Add it in Job Post first.'
          : activeBatch || activeJob || activeCandidate || activeIntake
            ? 'Analysis is already queued or running for this application.'
            : parsed.mode === 'candidate-only' && !currentJobRun(posting.id)
              ? 'A current completed Job Post analysis is required. Choose Job Post + Candidate instead.'
              : null
      db.insert(batchAnalysisItems)
        .values({
          batchId,
          jobApplicationId: application ? applicationId : null,
          jobPostingId: posting?.id ?? null,
          label: application
            ? `${application.title} at ${application.company}`
            : `Application #${applicationId}`,
          mode: parsed.mode,
          status: reason ? 'skipped' : 'queued',
          errorMessage: reason,
          createdAt: now,
          updatedAt: now,
        })
        .run()
    }
  })
  return batchId
}

type Enqueue = (
  id: number,
  persisted: (run: { id: number }) => void,
  runId?: number,
) => Promise<unknown>
type Dispatchers = { job: Enqueue; candidate: Enqueue }
const dispatchers: Dispatchers = {
  job: async (id, persisted, runId) => {
    const queue = await import('../job-analysis/queue')
    return runId ? queue.dispatchJobAnalysisRun(runId) : queue.enqueueJobAnalysis(id, persisted)
  },
  candidate: async (id, persisted, runId) => {
    const queue = await import('./queue')
    return runId
      ? queue.dispatchCandidateAnalysisRun(runId)
      : queue.enqueueCandidateAnalysis(id, persisted)
  },
}
let advancing = false

async function dispatchPersisted(action: () => Promise<unknown>) {
  try {
    await action()
  } catch (error) {
    // The child row is already the durable outbox. Retry that exact ID, not a new paid run.
    console.error('Batch child dispatch deferred to recovery', error)
  }
}

/** Reconcile persisted child IDs, not live "latest run" pointers. Never called by status GETs. */
export async function advanceBatchAnalyses(enqueue: Dispatchers = dispatchers) {
  if (advancing) return
  advancing = true
  try {
    const items = db
      .select()
      .from(batchAnalysisItems)
      .where(inArray(batchAnalysisItems.status, [...activeStatuses]))
      .orderBy(batchAnalysisItems.id)
      .all()
    for (const item of items) {
      const update = (values: Partial<typeof batchAnalysisItems.$inferInsert>) =>
        db
          .update(batchAnalysisItems)
          .set({ ...values, updatedAt: new Date().toISOString() })
          .where(eq(batchAnalysisItems.id, item.id))
          .run()
      try {
        if (
          !item.jobApplicationId ||
          !item.jobPostingId ||
          latestPosting(item.jobApplicationId)?.id !== item.jobPostingId
        )
          throw new Error(
            'The application was removed or its job post changed. Select it again to analyze the latest post.',
          )
        if (item.mode === 'job-and-candidate') {
          if (!item.jobAnalysisRunId) {
            let persisted = false
            await enqueue
              .job(item.jobPostingId, (run) => {
                update({ jobAnalysisRunId: run.id, status: 'job-analysis' })
                persisted = true
              })
              .catch((error) => {
                if (!persisted) throw error
                console.error('Batch child dispatch deferred to recovery', error)
              })
            if (!persisted) throw new Error('Job Post analysis could not be queued.')
            continue
          }
          const run = getJobAnalysisRun(db, item.jobAnalysisRunId)
          if (!run || run.status === 'Failed')
            throw new Error(run?.errorMessage || 'Job Post analysis failed.')
          if (run.status === 'Queued') {
            await dispatchPersisted(() => enqueue.job(item.jobPostingId!, () => undefined, run.id))
            continue
          }
          if (run.status !== 'Completed') continue
          if (currentJobRun(item.jobPostingId)?.id !== run.id)
            throw new Error(
              'Job Post analysis changed while this batch was running. Select the application again.',
            )
        }
        if (!item.candidateAnalysisRunId) {
          if (!currentJobRun(item.jobPostingId))
            throw new Error(
              'Job Post analysis is no longer current. Run Job Post + Candidate analysis.',
            )
          let persisted = false
          await enqueue
            .candidate(item.jobApplicationId, (run) => {
              update({ candidateAnalysisRunId: run.id, status: 'candidate-analysis' })
              persisted = true
            })
            .catch((error) => {
              if (!persisted) throw error
              console.error('Batch child dispatch deferred to recovery', error)
            })
          if (!persisted) throw new Error('Candidate analysis could not be queued.')
          continue
        }
        const run = getAnalysisRun(item.candidateAnalysisRunId)
        if (!run || run.status === 'Failed')
          throw new Error(run?.errorMessage || 'Candidate analysis failed.')
        if (run.status === 'Queued') {
          await dispatchPersisted(() =>
            enqueue.candidate(item.jobApplicationId!, () => undefined, run.id),
          )
          continue
        }
        if (run.status === 'Completed') update({ status: 'completed', errorMessage: null })
      } catch (error) {
        console.error('Batch analysis item failed', item.id, error)
        update({
          status: 'failed',
          errorMessage:
            error instanceof Error ? error.message : 'Analysis could not be started. Try again.',
        })
      }
    }
  } finally {
    advancing = false
  }
}

let recoveryTimer: ReturnType<typeof setInterval> | undefined
export function startBatchAnalysisRecovery() {
  if (recoveryTimer) return
  const advance = () =>
    void advanceBatchAnalyses().catch((error) =>
      console.error('Batch analysis recovery failed', error),
    )
  advance()
  recoveryTimer = setInterval(advance, 5_000)
  recoveryTimer.unref()
}
