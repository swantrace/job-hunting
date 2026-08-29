import { and, desc, eq, sql } from 'drizzle-orm'
import { todayISO } from '../lib/date'
import { listAnalysisRuns } from './analysis'
import { db } from './client'
import { listJobRequirements } from './job-analysis'
import {
  type BaselineGenerationRun,
  baselineGeneratedArtifacts,
  baselineGenerationEvidenceSnapshots,
  baselineGenerationRuns,
  companies,
  type GenerationRun,
  generatedArtifacts,
  generationEvidenceSnapshots,
  generationRunResults,
  generationRuns,
  googleDriveConnections,
  jobApplications,
  jobPostingAnalyses,
  jobPostings,
} from './schema'
import { listApplicationSkillRequirements } from './skill-queries'

export type GenerationRunWithArtifacts = GenerationRun & {
  artifacts: (typeof generatedArtifacts.$inferSelect)[]
}

export type BaselineGenerationRunWithArtifacts = BaselineGenerationRun & {
  artifacts: (typeof baselineGeneratedArtifacts.$inferSelect)[]
}

export type GenerationSource = {
  run: GenerationRun
  application: typeof jobApplications.$inferSelect
  company: typeof companies.$inferSelect
  skills: string[]
  requirements: ReturnType<typeof listApplicationSkillRequirements>
  jobPosting: typeof jobPostings.$inferSelect | undefined
  analysis: typeof jobPostingAnalyses.$inferSelect | undefined
  jobRequirements: ReturnType<typeof listJobRequirements>
  analysisRun: ReturnType<typeof listAnalysisRuns>[number] | null
  companyInterestNote: string | null
}

export function createGenerationRun(jobApplicationId: number) {
  const application = db
    .select({ id: jobApplications.id })
    .from(jobApplications)
    .where(eq(jobApplications.id, jobApplicationId))
    .get()
  if (!application) return null
  const date = todayISO()
  return db
    .insert(generationRuns)
    .values({
      jobApplicationId,
      queueJobId: `generation-${crypto.randomUUID()}`,
      status: 'Queued',
      createdAt: date,
      updatedAt: date,
    })
    .returning()
    .get()
}

export function createBaselineGenerationRun(input: {
  direction: string
  targetTitle: string
  targetKeywords: string[]
}) {
  const date = todayISO()
  return db
    .insert(baselineGenerationRuns)
    .values({
      ...input,
      targetKeywords: JSON.stringify(input.targetKeywords),
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
    .from(baselineGenerationRuns)
    .orderBy(desc(baselineGenerationRuns.id))
    .all()
  if (!runs.length) return []
  const artifacts = db
    .select()
    .from(baselineGeneratedArtifacts)
    .where(
      sql`${baselineGeneratedArtifacts.baselineGenerationRunId} in (${sql.join(
        runs.map((run) => sql`${run.id}`),
        sql`, `,
      )})`,
    )
    .all()
  return runs.map((run) => ({
    ...run,
    artifacts: artifacts.filter((artifact) => artifact.baselineGenerationRunId === run.id),
  }))
}

export function getBaselineGenerationRun(runId: number) {
  return (
    db.select().from(baselineGenerationRuns).where(eq(baselineGenerationRuns.id, runId)).get() ??
    null
  )
}

export function listQueuedBaselineGenerationRuns() {
  return db
    .select()
    .from(baselineGenerationRuns)
    .where(eq(baselineGenerationRuns.status, 'Queued'))
    .orderBy(baselineGenerationRuns.id)
    .all()
}

export function saveBaselineGenerationEvidenceSnapshot(
  runId: number,
  snapshotJson: string,
  filePath: string,
) {
  const date = todayISO()
  return db
    .insert(baselineGenerationEvidenceSnapshots)
    .values({ baselineGenerationRunId: runId, snapshotJson, filePath, createdAt: date })
    .onConflictDoUpdate({
      target: baselineGenerationEvidenceSnapshots.baselineGenerationRunId,
      set: { snapshotJson, filePath, createdAt: date },
    })
    .run()
}

export function getBaselineGenerationEvidenceSnapshot(runId: number) {
  return (
    db
      .select()
      .from(baselineGenerationEvidenceSnapshots)
      .where(eq(baselineGenerationEvidenceSnapshots.baselineGenerationRunId, runId))
      .get() ?? null
  )
}

export function markBaselineGenerationRunProcessing(runId: number) {
  const date = todayISO()
  db.update(baselineGenerationRuns)
    .set({
      status: 'Processing',
      attempts: sql`${baselineGenerationRuns.attempts} + 1`,
      errorMessage: null,
      startedAt: date,
      updatedAt: date,
    })
    .where(eq(baselineGenerationRuns.id, runId))
    .run()
}

export function completeBaselineGenerationRun(
  runId: number,
  artifact: { fileName: string; filePath: string; mimeType: string },
) {
  const date = todayISO()
  return db.transaction((tx) => {
    tx.update(baselineGenerationRuns)
      .set({ status: 'Completed', errorMessage: null, completedAt: date, updatedAt: date })
      .where(eq(baselineGenerationRuns.id, runId))
      .run()
    tx.insert(baselineGeneratedArtifacts)
      .values({ ...artifact, baselineGenerationRunId: runId, type: 'resume', createdAt: date })
      .onConflictDoUpdate({
        target: [
          baselineGeneratedArtifacts.baselineGenerationRunId,
          baselineGeneratedArtifacts.type,
        ],
        set: { ...artifact, createdAt: date },
      })
      .run()
  })
}

export function failBaselineGenerationRun(runId: number, error: unknown) {
  const message = error instanceof Error ? error.message : 'Baseline resume generation failed.'
  db.update(baselineGenerationRuns)
    .set({ status: 'Failed', errorMessage: message.slice(0, 2000), updatedAt: todayISO() })
    .where(eq(baselineGenerationRuns.id, runId))
    .run()
}

export function getBaselineArtifact(id: number) {
  return (
    db
      .select({ artifact: baselineGeneratedArtifacts, run: baselineGenerationRuns })
      .from(baselineGeneratedArtifacts)
      .innerJoin(
        baselineGenerationRuns,
        eq(baselineGeneratedArtifacts.baselineGenerationRunId, baselineGenerationRuns.id),
      )
      .where(eq(baselineGeneratedArtifacts.id, id))
      .get() ?? null
  )
}

export function listGenerationRuns(jobApplicationId: number): GenerationRunWithArtifacts[] {
  const runs = db
    .select()
    .from(generationRuns)
    .where(eq(generationRuns.jobApplicationId, jobApplicationId))
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
    ...run,
    artifacts: artifacts.filter((artifact) => artifact.generationRunId === run.id),
  }))
}

export function listQueuedGenerationRuns() {
  return db
    .select()
    .from(generationRuns)
    .where(eq(generationRuns.status, 'Queued'))
    .orderBy(generationRuns.id)
    .all()
}

export function getGenerationRun(runId: number) {
  return db.select().from(generationRuns).where(eq(generationRuns.id, runId)).get() ?? null
}

export function saveGenerationEvidenceSnapshot(
  runId: number,
  snapshotJson: string,
  filePath: string,
) {
  const date = todayISO()
  return db
    .insert(generationEvidenceSnapshots)
    .values({ generationRunId: runId, snapshotJson, filePath, createdAt: date })
    .onConflictDoUpdate({
      target: generationEvidenceSnapshots.generationRunId,
      set: { snapshotJson, filePath, createdAt: date },
    })
    .run()
}

export function getGenerationEvidenceSnapshot(runId: number) {
  return (
    db
      .select()
      .from(generationEvidenceSnapshots)
      .where(eq(generationEvidenceSnapshots.generationRunId, runId))
      .get() ?? null
  )
}

export function saveGenerationRunResults(
  runId: number,
  results: {
    resumeJson: string | null
    coverLetterJson: string | null
    atsAuditJson: string | null
  },
) {
  const date = todayISO()
  return db
    .insert(generationRunResults)
    .values({ generationRunId: runId, ...results, createdAt: date, updatedAt: date })
    .onConflictDoUpdate({
      target: generationRunResults.generationRunId,
      set: { ...results, updatedAt: date },
    })
    .run()
}

export function getGenerationRunResults(runId: number) {
  return (
    db
      .select()
      .from(generationRunResults)
      .where(eq(generationRunResults.generationRunId, runId))
      .get() ?? null
  )
}

export function getGenerationSource(runId: number): GenerationSource | null {
  const run = getGenerationRun(runId)
  if (!run) return null
  const row = db
    .select({ application: jobApplications, company: companies })
    .from(jobApplications)
    .innerJoin(companies, eq(jobApplications.companyId, companies.id))
    .where(eq(jobApplications.id, run.jobApplicationId))
    .get()
  if (!row) return null
  const jobPosting = db
    .select()
    .from(jobPostings)
    .where(eq(jobPostings.jobApplicationId, row.application.id))
    .get()
  const analysis = jobPosting
    ? db
        .select()
        .from(jobPostingAnalyses)
        .where(eq(jobPostingAnalyses.jobPostingId, jobPosting.id))
        .get()
    : undefined
  const requirements = listApplicationSkillRequirements(row.application.id)
  const jobRequirements = analysis ? listJobRequirements(analysis.id) : []
  const analysisRun =
    listAnalysisRuns(row.application.id).find(
      (run) => run.status === 'Completed' && !!run.confirmedProfileId,
    ) ?? null
  return {
    run,
    application: row.application,
    company: row.company,
    skills: requirements.map((item) => item.skillName),
    requirements,
    jobPosting,
    analysis,
    jobRequirements,
    analysisRun,
    companyInterestNote: null,
  }
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
    type: 'job_context' | 'resume' | 'cover_letter'
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
    .where(and(eq(generationRuns.id, runId), eq(generationRuns.jobApplicationId, jobApplicationId)))
    .get()
}
