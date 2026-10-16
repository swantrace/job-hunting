import { and, desc, eq, sql } from 'drizzle-orm'
import { documentDraftSchemaVersion } from '../ai/schemas/document-draft'
import { type AnalysisRunState, classifyAnalysisRunState } from '../lib/analysis/run-state'
import { todayISO } from '../lib/date'
import type { GeneratedArtifactType } from '../lib/generation/constants'
import { buildGenerationInput, generationStalenessReasons } from '../lib/generation/input'
import type { ApplicationAnalysisRun } from './analysis'
import { db } from './client'
import { listJobRequirements } from './job-analysis'
import {
  applicationAnalysisRuns,
  companies,
  type GenerationRun,
  generatedArtifacts,
  generationRuns,
  googleDriveConnections,
  jobApplications,
  jobPostingAnalyses,
  jobPostings,
} from './schema'
import { listRunSkillReviews, type RunSkillReview } from './skill-queries'

/**
 * One `generation_runs` table serves both pipelines (migration 0027). `kind`
 * discriminates application runs (which carry the candidate-analysis FK) from
 * baseline runs (whose `baseline_json` holds `{ direction, targetTitle,
 * targetKeywords }`). The former 1:1 result and evidence-snapshot side tables
 * are columns on the run row, and baseline resume artifacts are ordinary
 * `generated_artifacts` rows.
 */

export type GenerationRunWithArtifacts = GenerationRun & {
  artifacts: (typeof generatedArtifacts.$inferSelect)[]
}

/** A baseline run with its `baseline_json` descriptor decoded for callers. */
export type BaselineGenerationRunRecord = GenerationRun & {
  direction: string
  targetTitle: string
  targetKeywords: string
}

export type BaselineGenerationRunWithArtifacts = BaselineGenerationRunRecord & {
  artifacts: (typeof generatedArtifacts.$inferSelect)[]
}

type BaselineDescriptor = { direction: string; targetTitle: string; targetKeywords: string[] }

function decodeBaseline(row: GenerationRun): BaselineGenerationRunRecord {
  const descriptor = parseSnapshot(row.baselineJson) as Partial<BaselineDescriptor> | null
  return {
    ...row,
    direction: descriptor?.direction ?? '',
    targetTitle: descriptor?.targetTitle ?? '',
    targetKeywords: JSON.stringify(descriptor?.targetKeywords ?? []),
  }
}

export type GenerationSourceLineage = {
  application: typeof jobApplications.$inferSelect
  company: typeof companies.$inferSelect
  skills: string[]
  requirements: RunSkillReview[]
  jobPosting: typeof jobPostings.$inferSelect | undefined
  analysis: typeof jobPostingAnalyses.$inferSelect | undefined
  jobRequirements: ReturnType<typeof listJobRequirements>
  analysisRun: ApplicationAnalysisRun | null
  companyInterestNote: string | null
}

export type GenerationSource = GenerationSourceLineage & {
  run: GenerationRun
}

export type CreateGenerationRunInput = {
  applicationAnalysisRunId: number
  inputHash: string
  frozenInputJson: string
  resumeModel: string
  coverLetterModel: string
  promptVersion: string
  schemaVersion: string
}

export function createGenerationRun(input: CreateGenerationRunInput) {
  const date = todayISO()
  return db
    .insert(generationRuns)
    .values({
      kind: 'application',
      applicationAnalysisRunId: input.applicationAnalysisRunId,
      queueJobId: `generation-${crypto.randomUUID()}`,
      status: 'Queued',
      inputHash: input.inputHash,
      frozenInputJson: input.frozenInputJson,
      resumeModel: input.resumeModel,
      coverLetterModel: input.coverLetterModel,
      promptVersion: input.promptVersion,
      schemaVersion: input.schemaVersion,
      createdAt: date,
      updatedAt: date,
    })
    .returning()
    .get()
}

export type GenerationState = {
  state: AnalysisRunState
  latest: GenerationRun | null
  latestCompleted: GenerationRun | null
  currentCompleted: GenerationRun | null
  staleCompleted: GenerationRun | null
  reasons: string[]
}

function parseSnapshot(json: string | null): unknown {
  if (!json) return null
  try {
    return JSON.parse(json)
  } catch {
    return null
  }
}

/**
 * Classifies one application's document-generation history against current
 * inputs. A failed latest attempt never hides an older completed generation,
 * and stale generations carry controlled reason codes.
 */
export function getGenerationState(jobApplicationId: number): GenerationState {
  const runs = listGenerationRuns(jobApplicationId)
  const currentInput = buildGenerationInput(jobApplicationId)
  const result = classifyAnalysisRunState(
    runs.map((run) => ({
      id: run.id,
      status: run.status,
      inputHash: run.inputHash,
      schemaVersion: run.schemaVersion,
    })),
    currentInput?.inputHash ?? null,
    documentDraftSchemaVersion,
  )
  const byId = new Map(runs.map((run) => [run.id, run]))
  const resolve = (id: number | null | undefined) => (id == null ? null : (byId.get(id) ?? null))
  const staleCompleted = resolve(result.staleCompleted?.id)
  let reasons: string[] = []
  if (result.state === 'stale' && staleCompleted && currentInput) {
    reasons = generationStalenessReasons(
      currentInput.snapshot,
      parseSnapshot(staleCompleted.frozenInputJson),
    )
  }
  return {
    state: result.state,
    latest: resolve(result.latest?.id),
    latestCompleted: resolve(result.latestCompleted?.id),
    currentCompleted: resolve(result.currentCompleted?.id),
    staleCompleted,
    reasons,
  }
}

export function createBaselineGenerationRun(input: {
  direction: string
  targetTitle: string
  targetKeywords: string[]
}) {
  const date = todayISO()
  return db
    .insert(generationRuns)
    .values({
      kind: 'baseline',
      applicationAnalysisRunId: null,
      baselineJson: JSON.stringify({
        direction: input.direction,
        targetTitle: input.targetTitle,
        targetKeywords: input.targetKeywords,
      }),
      queueJobId: `baseline-generation-${crypto.randomUUID()}`,
      status: 'Queued',
      createdAt: date,
      updatedAt: date,
    })
    .returning()
    .get()
}

export function listBaselineGenerationRuns(): BaselineGenerationRunWithArtifacts[] {
  const runs = db
    .select()
    .from(generationRuns)
    .where(eq(generationRuns.kind, 'baseline'))
    .orderBy(desc(generationRuns.id))
    .all()
  if (!runs.length) return []
  const artifacts = db
    .select()
    .from(generatedArtifacts)
    .where(
      sql`${generatedArtifacts.generationRunId} in (${sql.join(
        runs.map((run) => sql`${run.id}`),
        sql`, `,
      )})`,
    )
    .all()
  return runs.map((run) => ({
    ...decodeBaseline(run),
    artifacts: artifacts.filter((artifact) => artifact.generationRunId === run.id),
  }))
}

export function getBaselineGenerationRun(runId: number) {
  const row =
    db
      .select()
      .from(generationRuns)
      .where(and(eq(generationRuns.id, runId), eq(generationRuns.kind, 'baseline')))
      .get() ?? null
  return row ? decodeBaseline(row) : null
}

export function listQueuedBaselineGenerationRuns() {
  return db
    .select()
    .from(generationRuns)
    .where(and(eq(generationRuns.kind, 'baseline'), eq(generationRuns.status, 'Queued')))
    .orderBy(generationRuns.id)
    .all()
    .map(decodeBaseline)
}

/** Resets baseline runs orphaned mid-flight by a crashed worker back to Queued. */
export function resetStaleProcessingBaselineGenerationRuns() {
  db.update(generationRuns)
    .set({ status: 'Queued', errorMessage: null, updatedAt: todayISO() })
    .where(and(eq(generationRuns.kind, 'baseline'), eq(generationRuns.status, 'Processing')))
    .run()
}

export function saveBaselineGenerationEvidenceSnapshot(runId: number, snapshotJson: string) {
  return db
    .update(generationRuns)
    .set({ evidenceSnapshotJson: snapshotJson, updatedAt: todayISO() })
    .where(eq(generationRuns.id, runId))
    .run()
}

export function getBaselineGenerationEvidenceSnapshot(runId: number) {
  const row =
    db
      .select({
        baselineGenerationRunId: generationRuns.id,
        snapshotJson: generationRuns.evidenceSnapshotJson,
        createdAt: generationRuns.createdAt,
      })
      .from(generationRuns)
      .where(eq(generationRuns.id, runId))
      .get() ?? null
  return row && row.snapshotJson !== null ? row : null
}

export function saveBaselineGenerationResults(
  runId: number,
  results: {
    resumeMarkdown: string | null
    draftValidationJson: string | null
    rendererVersion: string | null
  },
) {
  return db
    .update(generationRuns)
    .set({
      resumeMarkdown: results.resumeMarkdown,
      draftValidationJson: results.draftValidationJson,
      rendererVersion: results.rendererVersion,
      updatedAt: todayISO(),
    })
    .where(eq(generationRuns.id, runId))
    .run()
}

export function getBaselineGenerationResults(runId: number) {
  const row = db.select().from(generationRuns).where(eq(generationRuns.id, runId)).get()
  if (!row) return null
  return {
    baselineGenerationRunId: row.id,
    resumeMarkdown: row.resumeMarkdown,
    draftValidationJson: row.draftValidationJson,
    rendererVersion: row.rendererVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export function markBaselineGenerationRunProcessing(runId: number) {
  const date = todayISO()
  db.update(generationRuns)
    .set({
      status: 'Processing',
      attempts: sql`${generationRuns.attempts} + 1`,
      errorMessage: null,
      startedAt: date,
      updatedAt: date,
    })
    .where(eq(generationRuns.id, runId))
    .run()
}

export function completeBaselineGenerationRun(
  runId: number,
  artifact: { fileName: string; filePath: string; mimeType: string },
) {
  const date = todayISO()
  return db.transaction((tx) => {
    tx.update(generationRuns)
      .set({ status: 'Completed', errorMessage: null, completedAt: date, updatedAt: date })
      .where(eq(generationRuns.id, runId))
      .run()
    tx.insert(generatedArtifacts)
      .values({ ...artifact, generationRunId: runId, type: 'resume', createdAt: date })
      .onConflictDoUpdate({
        target: [generatedArtifacts.generationRunId, generatedArtifacts.type],
        set: { ...artifact, createdAt: date },
      })
      .run()
  })
}

export function failBaselineGenerationRun(runId: number, error: unknown) {
  const message = error instanceof Error ? error.message : 'Baseline resume generation failed.'
  db.update(generationRuns)
    .set({ status: 'Failed', errorMessage: message.slice(0, 2000), updatedAt: todayISO() })
    .where(eq(generationRuns.id, runId))
    .run()
}

export function getBaselineArtifact(id: number) {
  return (
    db
      .select({ artifact: generatedArtifacts, run: generationRuns })
      .from(generatedArtifacts)
      .innerJoin(generationRuns, eq(generatedArtifacts.generationRunId, generationRuns.id))
      .where(and(eq(generatedArtifacts.id, id), eq(generationRuns.kind, 'baseline')))
      .get() ?? null
  )
}

export function listGenerationRuns(jobApplicationId: number): GenerationRunWithArtifacts[] {
  const runs = db
    .select({ run: generationRuns })
    .from(generationRuns)
    .innerJoin(
      applicationAnalysisRuns,
      eq(generationRuns.applicationAnalysisRunId, applicationAnalysisRuns.id),
    )
    .innerJoin(
      jobPostingAnalyses,
      eq(applicationAnalysisRuns.jobPostingAnalysisId, jobPostingAnalyses.id),
    )
    .innerJoin(jobPostings, eq(jobPostingAnalyses.jobPostingId, jobPostings.id))
    .where(
      and(
        eq(jobPostings.jobApplicationId, jobApplicationId),
        eq(generationRuns.kind, 'application'),
      ),
    )
    .orderBy(desc(generationRuns.id))
    .all()
    .map((row) => row.run)
  if (!runs.length) return []
  const artifacts = db
    .select()
    .from(generatedArtifacts)
    .where(
      sql`${generatedArtifacts.generationRunId} in (${sql.join(
        runs.map((run) => sql`${run.id}`),
        sql`, `,
      )})`,
    )
    .all()
  return runs.map((run) => ({
    ...run,
    artifacts: artifacts.filter((artifact) => artifact.generationRunId === run.id),
  }))
}

export function listQueuedGenerationRuns() {
  return db
    .select()
    .from(generationRuns)
    .where(and(eq(generationRuns.kind, 'application'), eq(generationRuns.status, 'Queued')))
    .orderBy(generationRuns.id)
    .all()
}

/** Resets generation runs orphaned mid-flight by a crashed worker back to Queued. */
export function resetStaleProcessingGenerationRuns() {
  db.update(generationRuns)
    .set({ status: 'Queued', errorMessage: null, updatedAt: todayISO() })
    .where(and(eq(generationRuns.kind, 'application'), eq(generationRuns.status, 'Processing')))
    .run()
}

export function getGenerationRun(runId: number) {
  return db.select().from(generationRuns).where(eq(generationRuns.id, runId)).get() ?? null
}

export function saveGenerationEvidenceSnapshot(runId: number, snapshotJson: string) {
  return db
    .update(generationRuns)
    .set({ evidenceSnapshotJson: snapshotJson, updatedAt: todayISO() })
    .where(eq(generationRuns.id, runId))
    .run()
}

export function getGenerationEvidenceSnapshot(runId: number) {
  const row =
    db
      .select({
        generationRunId: generationRuns.id,
        snapshotJson: generationRuns.evidenceSnapshotJson,
        createdAt: generationRuns.createdAt,
      })
      .from(generationRuns)
      .where(eq(generationRuns.id, runId))
      .get() ?? null
  if (!row || row.snapshotJson === null) return null
  return {
    generationRunId: row.generationRunId,
    snapshotJson: row.snapshotJson,
    createdAt: row.createdAt,
  }
}

export function saveGenerationRunResults(
  runId: number,
  results: {
    resumeJson: string | null
    coverLetterJson: string | null
    atsAuditJson: string | null
    resumeMarkdown?: string | null
    coverLetterMarkdown?: string | null
    draftValidationJson?: string | null
    rendererVersion?: string | null
  },
) {
  return db
    .update(generationRuns)
    .set({
      resumeJson: results.resumeJson,
      coverLetterJson: results.coverLetterJson,
      atsAuditJson: results.atsAuditJson,
      resumeMarkdown: results.resumeMarkdown ?? null,
      coverLetterMarkdown: results.coverLetterMarkdown ?? null,
      draftValidationJson: results.draftValidationJson ?? null,
      rendererVersion: results.rendererVersion ?? null,
      updatedAt: todayISO(),
    })
    .where(eq(generationRuns.id, runId))
    .run()
}

export function getGenerationRunResults(runId: number) {
  const row = db.select().from(generationRuns).where(eq(generationRuns.id, runId)).get()
  if (!row) return null
  return {
    generationRunId: row.id,
    resumeJson: row.resumeJson,
    coverLetterJson: row.coverLetterJson,
    atsAuditJson: row.atsAuditJson,
    resumeMarkdown: row.resumeMarkdown,
    coverLetterMarkdown: row.coverLetterMarkdown,
    draftValidationJson: row.draftValidationJson,
    rendererVersion: row.rendererVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/**
 * Resolves the freeze-able generation lineage from a completed Candidate
 * Analysis run: Candidate Analysis -> Job Analysis -> Job Post -> Application ->
 * Company. No redundant application FK or legacy application-skill table is
 * consulted, so an enqueue can freeze the exact facts a worker will consume.
 */
export function getGenerationSourceLineage(
  candidateAnalysisRunId: number,
): GenerationSourceLineage | null {
  const candidateRun = db
    .select()
    .from(applicationAnalysisRuns)
    .where(eq(applicationAnalysisRuns.id, candidateAnalysisRunId))
    .get()
  const analysis = candidateRun?.jobPostingAnalysisId
    ? db
        .select()
        .from(jobPostingAnalyses)
        .where(eq(jobPostingAnalyses.id, candidateRun.jobPostingAnalysisId))
        .get()
    : undefined
  const jobPosting = analysis
    ? db.select().from(jobPostings).where(eq(jobPostings.id, analysis.jobPostingId)).get()
    : undefined
  const applicationId = jobPosting?.jobApplicationId
  if (!applicationId) return null
  const row = db
    .select({ application: jobApplications, company: companies })
    .from(jobApplications)
    .innerJoin(companies, eq(jobApplications.companyId, companies.id))
    .where(eq(jobApplications.id, applicationId))
    .get()
  if (!row) return null
  const requirements = candidateRun ? listRunSkillReviews(candidateRun.id) : []
  const jobRequirements = analysis ? listJobRequirements(analysis.id) : []
  return {
    application: row.application,
    company: row.company,
    skills: requirements.map((item) => item.skillName),
    requirements,
    jobPosting,
    analysis,
    jobRequirements,
    analysisRun: candidateRun ?? null,
    companyInterestNote: null,
  }
}

export function getGenerationSource(runId: number): GenerationSource | null {
  const run = getGenerationRun(runId)
  if (!run || !run.applicationAnalysisRunId) return null
  const lineage = getGenerationSourceLineage(run.applicationAnalysisRunId)
  return lineage ? { run, ...lineage } : null
}

export function markGenerationRunProcessing(runId: number) {
  const date = todayISO()
  db.update(generationRuns)
    .set({
      status: 'Processing',
      attempts: sql`${generationRuns.attempts} + 1`,
      errorMessage: null,
      startedAt: date,
      updatedAt: date,
    })
    .where(eq(generationRuns.id, runId))
    .run()
}

export function completeGenerationRun(
  runId: number,
  artifacts: Array<{
    type: GeneratedArtifactType
    fileName: string
    filePath: string
    mimeType: string
  }>,
) {
  const date = todayISO()
  return db.transaction((tx) => {
    tx.update(generationRuns)
      .set({ status: 'Completed', errorMessage: null, completedAt: date, updatedAt: date })
      .where(eq(generationRuns.id, runId))
      .run()
    for (const artifact of artifacts)
      tx.insert(generatedArtifacts)
        .values({ ...artifact, generationRunId: runId, createdAt: date })
        .onConflictDoUpdate({
          target: [generatedArtifacts.generationRunId, generatedArtifacts.type],
          set: { ...artifact, createdAt: date },
        })
        .run()
  })
}

export function failGenerationRun(runId: number, error: unknown) {
  const message = error instanceof Error ? error.message : 'Generation failed.'
  db.update(generationRuns)
    .set({ status: 'Failed', errorMessage: message.slice(0, 2000), updatedAt: todayISO() })
    .where(eq(generationRuns.id, runId))
    .run()
}

export function getArtifact(id: number) {
  return (
    db
      .select({ artifact: generatedArtifacts, run: generationRuns })
      .from(generatedArtifacts)
      .innerJoin(generationRuns, eq(generatedArtifacts.generationRunId, generationRuns.id))
      .where(eq(generatedArtifacts.id, id))
      .get() ?? null
  )
}

export function getGoogleDriveConnection() {
  return (
    db.select().from(googleDriveConnections).where(eq(googleDriveConnections.id, 1)).get() ?? null
  )
}

export function saveGoogleDriveConnection(refreshTokenEncrypted: string, folderId: string) {
  const date = todayISO()
  db.insert(googleDriveConnections)
    .values({ id: 1, refreshTokenEncrypted, folderId, createdAt: date, updatedAt: date })
    .onConflictDoUpdate({
      target: googleDriveConnections.id,
      set: { refreshTokenEncrypted, folderId, updatedAt: date },
    })
    .run()
}

export function markArtifactUploaded(artifactId: number, fileId: string, url: string | null) {
  db.update(generatedArtifacts)
    .set({
      googleDriveFileId: fileId,
      googleDriveUrl: url,
      googleDriveUploadedAt: todayISO(),
      googleDriveError: null,
    })
    .where(eq(generatedArtifacts.id, artifactId))
    .run()
}

export function markArtifactUploadFailed(artifactId: number, error: unknown) {
  const message = error instanceof Error ? error.message : 'Google Drive upload failed.'
  db.update(generatedArtifacts)
    .set({ googleDriveError: message.slice(0, 1000) })
    .where(eq(generatedArtifacts.id, artifactId))
    .run()
}

export function generationRunBelongsToApplication(runId: number, jobApplicationId: number) {
  return !!db
    .select({ id: generationRuns.id })
    .from(generationRuns)
    .innerJoin(
      applicationAnalysisRuns,
      eq(generationRuns.applicationAnalysisRunId, applicationAnalysisRuns.id),
    )
    .innerJoin(
      jobPostingAnalyses,
      eq(applicationAnalysisRuns.jobPostingAnalysisId, jobPostingAnalyses.id),
    )
    .innerJoin(jobPostings, eq(jobPostingAnalyses.jobPostingId, jobPostings.id))
    .where(and(eq(generationRuns.id, runId), eq(jobPostings.jobApplicationId, jobApplicationId)))
    .get()
}
