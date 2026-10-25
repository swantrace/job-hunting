import { desc, eq, inArray } from 'drizzle-orm'
import { nowISO } from '../lib/date'
import { IntakeError } from '../lib/job-intake/contracts'
import { db } from './client'
import { updateExtensionItem } from './extension-intake'
import { analysisWorkflows, batchAnalysisItems, jobPostings } from './schema'

export type AnalysisWorkflow = typeof analysisWorkflows.$inferSelect

export function getAnalysisWorkflow(id: number) {
  return db.select().from(analysisWorkflows).where(eq(analysisWorkflows.id, id)).get()
}

export function pendingAnalysisWorkflows() {
  return db
    .select()
    .from(analysisWorkflows)
    .where(inArray(analysisWorkflows.status, ['Queued', 'Processing']))
    .all()
}

export function createAnalysisWorkflow(
  input: Omit<typeof analysisWorkflows.$inferInsert, 'id' | 'createdAt' | 'updatedAt'>,
) {
  const now = nowISO()
  db.insert(analysisWorkflows)
    .values({ ...input, createdAt: now, updatedAt: now })
    .onConflictDoNothing({ target: analysisWorkflows.sourceKey })
    .run()
  return db
    .select()
    .from(analysisWorkflows)
    .where(eq(analysisWorkflows.sourceKey, input.sourceKey))
    .get()!
}

export function updateAnalysisWorkflow(
  id: number,
  changes: Partial<typeof analysisWorkflows.$inferInsert>,
) {
  db.update(analysisWorkflows)
    .set({ ...changes, updatedAt: nowISO() })
    .where(eq(analysisWorkflows.id, id))
    .run()
}

/** Never let a queued workflow silently switch to a newer captured posting. */
export function assertWorkflowPosting(id: number) {
  const request = getAnalysisWorkflow(id)
  const latest =
    request?.jobApplicationId &&
    db
      .select()
      .from(jobPostings)
      .where(eq(jobPostings.jobApplicationId, request.jobApplicationId))
      .orderBy(desc(jobPostings.version))
      .get()
  if (!request || !request.jobPostingId || !latest || latest.id !== request.jobPostingId)
    throw new IntakeError(
      'posting-superseded',
      'The application was removed or its job post changed. Analyze the latest post again.',
    )
  return request
}

/** UI/API state is a projection, not a second scheduler. Update it with the outbox. */
export function projectAnalysisWorkflow(
  id: number,
  stage: 'job-analysis' | 'candidate-analysis' | 'completed' | 'failed',
  error?: unknown,
) {
  db.transaction(() => {
    const request = getAnalysisWorkflow(id)
    if (!request) return
    const message =
      error === undefined
        ? null
        : (error instanceof Error ? error.message : String(error)).slice(0, 2000)
    const status =
      stage === 'completed' ? 'Completed' : stage === 'failed' ? 'Failed' : 'Processing'
    updateAnalysisWorkflow(id, { status, errorMessage: message })
    if (request.batchItemId)
      db.update(batchAnalysisItems)
        .set({
          status: stage,
          jobAnalysisRunId: request.mode === 'candidate-only' ? null : request.jobAnalysisRunId,
          candidateAnalysisRunId: request.candidateAnalysisRunId,
          errorMessage: message,
          updatedAt: nowISO(),
        })
        .where(eq(batchAnalysisItems.id, request.batchItemId))
        .run()
    if (request.intakeItemId)
      updateExtensionItem(request.intakeItemId, {
        pipelineStatus:
          stage === 'completed' ? 'completed' : stage === 'failed' ? 'failed' : 'processing',
        stage: stage === 'completed' || stage === 'failed' ? 'done' : stage,
        jobAnalysisRunId: request.jobAnalysisRunId,
        candidateAnalysisRunId: request.candidateAnalysisRunId,
        ...(stage === 'completed' ? { status: 'ready' as const } : {}),
        errorCode:
          stage === 'failed'
            ? error instanceof IntakeError
              ? error.code
              : 'analysis-failed'
            : null,
        errorMessage: message,
        claimedAt: null,
      })
  })
}
