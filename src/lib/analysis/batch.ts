import { and, desc, eq, inArray } from 'drizzle-orm'
import { createAnalysisWorkflow, projectAnalysisWorkflow } from '../../db/analysis-workflows'
import { db } from '../../db/client'
import { getJobAnalysisState } from '../../db/job-analysis-runs'
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

/** Deliver persisted batch items to the shared engine; never poll child states. */
export async function advanceBatchAnalyses() {
  const items = db
    .select()
    .from(batchAnalysisItems)
    .where(inArray(batchAnalysisItems.status, [...activeStatuses]))
    .all()
  for (const item of items) {
    try {
      db.transaction(() => {
        const posting = item.jobApplicationId && latestPosting(item.jobApplicationId)
        const request = createAnalysisWorkflow({
          sourceKey: `batch-item:${item.id}`,
          mode: item.mode,
          batchItemId: item.id,
          jobApplicationId: item.jobApplicationId,
          jobPostingId: item.jobPostingId,
          jobAnalysisRunId:
            item.jobAnalysisRunId ??
            (item.mode === 'candidate-only' && posting ? currentJobRun(posting.id)?.id : null),
          candidateAnalysisRunId: item.candidateAnalysisRunId,
        })
        if (!posting || posting.id !== item.jobPostingId)
          projectAnalysisWorkflow(
            request.id,
            'failed',
            new Error(
              'The application was removed or its job post changed. Select it again to analyze the latest post.',
            ),
          )
      })
    } catch (error) {
      console.error('Batch workflow submission deferred', item.id, error)
    }
  }
  const { dispatchAnalysisWorkflows } = await import('./workflow')
  await dispatchAnalysisWorkflows()
}
