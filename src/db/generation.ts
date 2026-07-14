import { and, desc, eq, sql } from 'drizzle-orm'
import { todayISO } from '../lib/date'
import { db } from './client'
import {
  companies,
  type GenerationRun,
  generatedArtifacts,
  generationRuns,
  googleDriveConnections,
  jobApplications,
  jobApplicationsToSkills,
  jobPostingAnalyses,
  jobPostings,
  skills,
} from './schema'

export type GenerationRunWithArtifacts = GenerationRun & {
  artifacts: (typeof generatedArtifacts.$inferSelect)[]
}

export type GenerationSource = {
  run: GenerationRun
  application: typeof jobApplications.$inferSelect
  company: typeof companies.$inferSelect
  skills: string[]
  jobPosting: typeof jobPostings.$inferSelect | undefined
  analysis: typeof jobPostingAnalyses.$inferSelect | undefined
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
  const jobSkills = db
    .select({ name: skills.name })
    .from(jobApplicationsToSkills)
    .innerJoin(skills, eq(jobApplicationsToSkills.skillId, skills.id))
    .where(eq(jobApplicationsToSkills.jobApplicationId, row.application.id))
    .all()
    .map((skill) => skill.name)
  return {
    run,
    application: row.application,
    company: row.company,
    skills: jobSkills,
    jobPosting,
    analysis,
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
