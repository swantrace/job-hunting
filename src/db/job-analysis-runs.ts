import { and, desc, eq, sql } from 'drizzle-orm'
import { jobAnalysisSchemaVersion } from '../ai/schemas/job-analysis'
import type { ParsedJobResult } from '../lib/ai'
import { type AnalysisRunState, classifyAnalysisRunState } from '../lib/analysis-run-state'
import { todayISO } from '../lib/date'
import type { db } from './client'
import { type JobRequirementInput, persistJobRequirements } from './job-analysis'
import { type JobPostingAnalysis, jobPostingAnalyses, jobPostings } from './schema'
import { type DbExecutor, persistSkillRequirements } from './skill-queries'

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
      generatedAt: date,
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
 * Completes a run in one transaction: result columns, normalized requirements,
 * and current application skill reconciliation all commit together so a failure
 * never partially replaces the posting's current requirements or skills.
 */
export function completeJobAnalysisRun(db: JobAnalysisDb, runId: number, parsed: ParsedJobResult) {
  const date = todayISO()
  return db.transaction((tx) => {
    const run = tx.select().from(jobPostingAnalyses).where(eq(jobPostingAnalyses.id, runId)).get()
    if (!run) throw new Error('Job analysis run no longer exists.')
    const posting = tx.select().from(jobPostings).where(eq(jobPostings.id, run.jobPostingId)).get()
    if (!posting) throw new Error('Job posting no longer exists.')

    tx.update(jobPostingAnalyses)
      .set({
        status: 'Completed',
        errorMessage: null,
        requirements: parsed.requirements.join('\n'),
        responsibilities: parsed.responsibilities.join('\n'),
        painPoints: parsed.painPoints.join('\n'),
        culture: parsed.culture.join('\n'),
        redFlags: parsed.redFlags.join('\n'),
        successMetrics: parsed.successMetrics.join('\n'),
        benefits: parsed.benefits.join('\n'),
        notes: parsed.notes,
        generatedAt: date,
        model: parsed.parserModel,
        promptVersion: parsed.parserPromptVersion,
        summary: JSON.stringify(parsed.analysis.summary),
        roleType: parsed.analysis.classification.roleType,
        advertisedSeniority: parsed.analysis.classification.advertisedSeniority,
        practicalSeniority: parsed.analysis.classification.practicalSeniority,
        classificationRationale: parsed.analysis.classification.rationale,
        functionalEmphasisJson: JSON.stringify(parsed.analysis.classification.functionalEmphasis),
        interviewQuestionsJson: JSON.stringify(parsed.analysis.interviewQuestions),
        schemaVersion: jobAnalysisSchemaVersion,
        completedAt: date,
        updatedAt: date,
      })
      .where(eq(jobPostingAnalyses.id, runId))
      .run()

    persistJobRequirements(tx, runId, parsed.analysis.requirements, date)
    persistSkillRequirements(tx, posting.jobApplicationId, parsed.skills)
  })
}

export type CompletedJobAnalysisInput = {
  jobPostingId: number
  inputHash: string
  frozenInputJson: string
  model: string | null | undefined
  promptVersion: string | null | undefined
  requirements: string | null | undefined
  responsibilities: string | null | undefined
  painPoints: string | null | undefined
  culture: string | null | undefined
  redFlags: string | null | undefined
  successMetrics: string | null | undefined
  benefits: string | null | undefined
  notes: string | null | undefined
  summary: string | null | undefined
  roleType: string | null | undefined
  advertisedSeniority: string | null | undefined
  practicalSeniority: string | null | undefined
  classificationRationale: string | null | undefined
  functionalEmphasisJson: string | null | undefined
  interviewQuestionsJson: string | null | undefined
  schemaVersion: string | null | undefined
  requirementsRows: JobRequirementInput[]
  date: string
}

/**
 * Persists a pre-save Quick Collect draft as a completed run with full input
 * identity. No LLM is called; the reviewed draft already produced these fields.
 */
export function persistCompletedJobAnalysis(tx: DbExecutor, input: CompletedJobAnalysisInput) {
  const saved = tx
    .insert(jobPostingAnalyses)
    .values({
      jobPostingId: input.jobPostingId,
      status: 'Completed',
      inputHash: input.inputHash,
      frozenInputJson: input.frozenInputJson,
      requirements: input.requirements ?? null,
      responsibilities: input.responsibilities ?? null,
      painPoints: input.painPoints ?? null,
      culture: input.culture ?? null,
      redFlags: input.redFlags ?? null,
      successMetrics: input.successMetrics ?? null,
      benefits: input.benefits ?? null,
      notes: input.notes ?? null,
      generatedAt: input.date,
      model: input.model ?? null,
      promptVersion: input.promptVersion ?? null,
      summary: input.summary ?? null,
      roleType: input.roleType ?? null,
      advertisedSeniority: input.advertisedSeniority ?? null,
      practicalSeniority: input.practicalSeniority ?? null,
      classificationRationale: input.classificationRationale ?? null,
      functionalEmphasisJson: input.functionalEmphasisJson ?? null,
      interviewQuestionsJson: input.interviewQuestionsJson ?? null,
      schemaVersion: input.schemaVersion ?? null,
      createdAt: input.date,
      updatedAt: input.date,
      completedAt: input.date,
    })
    .returning()
    .get()
  if (input.requirementsRows.length) {
    persistJobRequirements(tx, saved.id, input.requirementsRows, input.date)
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
