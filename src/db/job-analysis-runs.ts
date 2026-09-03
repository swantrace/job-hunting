import { createHash } from 'node:crypto'
import { and, desc, eq, sql } from 'drizzle-orm'
import { type JobAnalysis, jobAnalysisSchemaVersion } from '../ai/schemas/job-analysis'
import type { ParsedJobResult } from '../lib/ai'
import { type AnalysisRunState, classifyAnalysisRunState } from '../lib/analysis-run-state'
import { nowISO, todayISO } from '../lib/date'
import type { db } from './client'
import { persistJobRequirements } from './job-analysis'
import { type JobPostingAnalysis, jobApplications, jobPostingAnalyses, jobPostings } from './schema'
import { type DbExecutor } from './skill-queries'

export type JobAnalysisDb = Pick<
  typeof db,
  'select' | 'insert' | 'delete' | 'update' | 'transaction'
>
export type JobAnalysisRun = JobPostingAnalysis

export type CreateJobAnalysisRunInput = {
  jobPostingId: number
  inputHash: string
  frozenInputJson: string
  model: string
  promptVersion: string
  schemaVersion: string
}

export function listJobAnalysisRuns(db: JobAnalysisDb, jobPostingId: number): JobAnalysisRun[] {
  return db
    .select()
    .from(jobPostingAnalyses)
    .where(eq(jobPostingAnalyses.jobPostingId, jobPostingId))
    .orderBy(desc(jobPostingAnalyses.id))
    .all()
}

export function getJobAnalysisRun(db: JobAnalysisDb, runId: number): JobAnalysisRun | null {
  return db.select().from(jobPostingAnalyses).where(eq(jobPostingAnalyses.id, runId)).get() ?? null
}

export function listQueuedJobAnalysisRuns(db: JobAnalysisDb): JobAnalysisRun[] {
  return db
    .select()
    .from(jobPostingAnalyses)
    .where(eq(jobPostingAnalyses.status, 'Queued'))
    .orderBy(jobPostingAnalyses.id)
    .all()
}

/** Resets runs orphaned mid-flight by a crashed worker back to Queued. */
export function resetStaleProcessingJobAnalysisRuns(db: JobAnalysisDb) {
  db.update(jobPostingAnalyses)
    .set({ status: 'Queued', errorMessage: null, updatedAt: todayISO() })
    .where(eq(jobPostingAnalyses.status, 'Processing'))
    .run()
}

export function createJobAnalysisRun(db: JobAnalysisDb, input: CreateJobAnalysisRunInput) {
  const date = todayISO()
  return db
    .insert(jobPostingAnalyses)
    .values({
      jobPostingId: input.jobPostingId,
      status: 'Queued',
      queueJobId: `job-analysis-${crypto.randomUUID()}`,
      attempts: 0,
      inputHash: input.inputHash,
      frozenInputJson: input.frozenInputJson,
      model: input.model,
      promptVersion: input.promptVersion,
      schemaVersion: input.schemaVersion,
      createdAt: date,
      updatedAt: date,
    })
    .returning()
    .get()
}

export function findReusableJobAnalysisRun(
  db: JobAnalysisDb,
  jobPostingId: number,
  inputHash: string,
) {
  return (
    db
      .select()
      .from(jobPostingAnalyses)
      .where(
        and(
          eq(jobPostingAnalyses.jobPostingId, jobPostingId),
          eq(jobPostingAnalyses.inputHash, inputHash),
          sql`${jobPostingAnalyses.status} in ('Queued', 'Processing')`,
        ),
      )
      .orderBy(desc(jobPostingAnalyses.id))
      .get() ?? null
  )
}

export function markJobAnalysisRunProcessing(db: JobAnalysisDb, runId: number) {
  const date = todayISO()
  db.update(jobPostingAnalyses)
    .set({
      status: 'Processing',
      attempts: sql`${jobPostingAnalyses.attempts} + 1`,
      errorMessage: null,
      startedAt: date,
      updatedAt: date,
    })
    .where(eq(jobPostingAnalyses.id, runId))
    .run()
}

export function failJobAnalysisRun(db: JobAnalysisDb, runId: number, error: unknown) {
  const message = error instanceof Error ? error.message : 'Job analysis failed.'
  db.update(jobPostingAnalyses)
    .set({ status: 'Failed', errorMessage: message.slice(0, 2000), updatedAt: todayISO() })
    .where(eq(jobPostingAnalyses.id, runId))
    .run()
}

/**
 * Completes a run in one transaction: result JSON, normalized requirements,
 * and canonical requirement-skill junction rows all commit together so a
 * failure never partially replaces the posting's current analysis.
 */
export function completeJobAnalysisRun(db: JobAnalysisDb, runId: number, parsed: ParsedJobResult) {
  const date = todayISO()
  return db.transaction((tx) => {
    const run = tx.select().from(jobPostingAnalyses).where(eq(jobPostingAnalyses.id, runId)).get()
    if (!run) throw new Error('Job analysis run no longer exists.')
    const posting = tx.select().from(jobPostings).where(eq(jobPostings.id, run.jobPostingId)).get()
    if (!posting) throw new Error('Job posting no longer exists.')

    const analysis = parsed.analysis
    tx.update(jobPostingAnalyses)
      .set({
        status: 'Completed',
        errorMessage: null,
        model: parsed.parserModel,
        promptVersion: parsed.parserPromptVersion,
        schemaVersion: jobAnalysisSchemaVersion,
        resultJson: JSON.stringify(analysis),
        completedAt: date,
        updatedAt: date,
      })
      .where(eq(jobPostingAnalyses.id, runId))
      .run()

    // Apply the model-proposed direction to the application. The user can
    // change it afterwards; the model only proposes it.
    tx.update(jobApplications)
      .set({ direction: parsed.direction, updatedAt: date })
      .where(eq(jobApplications.id, posting.jobApplicationId))
      .run()

    persistJobRequirements(tx, runId, analysis.requirements, date)
  })
}

export type CompletedJobAnalysisInput = {
  jobPostingId: number
  inputHash: string
  frozenInputJson: string
  model: string | null | undefined
  promptVersion: string | null | undefined
  analysis: JobAnalysis
  schemaVersion: string
  date: string
}

/**
 * Persists a pre-save Quick Collect draft as a completed run with full input
 * identity. No LLM is called; the reviewed draft already produced the validated
 * analysis.
 */
export function persistCompletedJobAnalysis(tx: DbExecutor, input: CompletedJobAnalysisInput) {
  const analysis = input.analysis
  const saved = tx
    .insert(jobPostingAnalyses)
    .values({
      jobPostingId: input.jobPostingId,
      status: 'Completed',
      inputHash: input.inputHash,
      frozenInputJson: input.frozenInputJson,
      model: input.model ?? null,
      promptVersion: input.promptVersion ?? null,
      schemaVersion: input.schemaVersion,
      resultJson: JSON.stringify(analysis),
      createdAt: input.date,
      updatedAt: input.date,
      completedAt: input.date,
    })
    .returning()
    .get()
  if (analysis.requirements.length) {
    persistJobRequirements(tx, saved.id, analysis.requirements, input.date)
  }
  return saved
}

export type JobAnalysisState = {
  state: AnalysisRunState
  latest: JobAnalysisRun | null
  latestCompleted: JobAnalysisRun | null
  currentCompleted: JobAnalysisRun | null
  staleCompleted: JobAnalysisRun | null
}

/**
 * Classifies one posting's run history against the current input hash. Legacy
 * (null schema/input) and stale (input mismatch) results stay readable while
 * only a current match unlocks downstream stages.
 */
export function getJobAnalysisState(
  db: JobAnalysisDb,
  jobPostingId: number,
  currentInputHash: string | null,
): JobAnalysisState {
  const runs = listJobAnalysisRuns(db, jobPostingId)
  const result = classifyAnalysisRunState(
    runs.map((run) => ({
      id: run.id,
      status: run.status,
      inputHash: run.inputHash,
      schemaVersion: run.schemaVersion,
    })),
    currentInputHash,
    jobAnalysisSchemaVersion,
  )
  const byId = new Map(runs.map((run) => [run.id, run]))
  const resolve = (id: number | null | undefined) => (id == null ? null : (byId.get(id) ?? null))
  return {
    state: result.state,
    latest: resolve(result.latest?.id),
    latestCompleted: resolve(result.latestCompleted?.id),
    currentCompleted: resolve(result.currentCompleted?.id),
    staleCompleted: resolve(result.staleCompleted?.id),
  }
}

export function jobAnalysisRunBelongsToPosting(
  db: JobAnalysisDb,
  runId: number,
  jobPostingId: number,
) {
  return !!db
    .select({ id: jobPostingAnalyses.id })
    .from(jobPostingAnalyses)
    .where(and(eq(jobPostingAnalyses.id, runId), eq(jobPostingAnalyses.jobPostingId, jobPostingId)))
    .get()
}

/**
 * Saves a Job Post as an immutable content version. Identical normalized text
 * reuses the current content version (no new row); changed text inserts the
 * next version. Returns the resulting posting ID and content hash so callers
 * can queue an analysis rerun against the exact version.
 */
export function saveJobPostingVersion(
  db: JobAnalysisDb,
  jobApplicationId: number,
  rawText: string,
) {
  const contentHash = createHash('sha256').update(rawText).digest('hex')
  const current = db
    .select()
    .from(jobPostings)
    .where(eq(jobPostings.jobApplicationId, jobApplicationId))
    .orderBy(desc(jobPostings.version), desc(jobPostings.id))
    .get()
  if (current?.contentHash === contentHash)
    return { jobPostingId: current.id, contentHash, reused: true }
  const version = current ? current.version + 1 : 1
  const created = db
    .insert(jobPostings)
    .values({
      jobApplicationId,
      version,
      rawText,
      capturedAt: nowISO(),
      contentHash,
    })
    .returning({ id: jobPostings.id })
    .get()
  return { jobPostingId: created.id, contentHash, reused: false }
}
