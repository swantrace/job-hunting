import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { todayISO } from '../lib/date'
import { seedPendingRunDecisions } from './analysis-decisions'
import { db } from './client'
import {
  type ApplicationAnalysisRun,
  applicationAnalysisRuns,
  jobApplications,
  jobPostingAnalyses,
  jobPostings,
  jobRequirements,
  jobRequirementsToSkills,
  skills,
} from './schema'

export type { ApplicationAnalysisRun }

function applicationIdForAnalysisRun(runId: number): number | null {
  return (
    db
      .select({ jobApplicationId: jobPostings.jobApplicationId })
      .from(applicationAnalysisRuns)
      .innerJoin(
        jobPostingAnalyses,
        eq(applicationAnalysisRuns.jobPostingAnalysisId, jobPostingAnalyses.id),
      )
      .innerJoin(jobPostings, eq(jobPostingAnalyses.jobPostingId, jobPostings.id))
      .where(eq(applicationAnalysisRuns.id, runId))
      .get()?.jobApplicationId ?? null
  )
}

export function createAnalysisRun(input: {
  jobPostingAnalysisId: number
  inputHash: string
  inputSnapshotJson: string
  model: string
  promptVersion: string
  schemaVersion: string
}) {
  const date = todayISO()
  return db
    .insert(applicationAnalysisRuns)
    .values({
      jobPostingAnalysisId: input.jobPostingAnalysisId,
      queueJobId: `analysis-${crypto.randomUUID()}`,
      status: 'Queued',
      inputHash: input.inputHash,
      inputSnapshotJson: input.inputSnapshotJson,
      model: input.model,
      promptVersion: input.promptVersion,
      schemaVersion: input.schemaVersion,
      createdAt: date,
      updatedAt: date,
    })
    .returning()
    .get()
}

export function getAnalysisRun(runId: number) {
  return (
    db.select().from(applicationAnalysisRuns).where(eq(applicationAnalysisRuns.id, runId)).get() ??
    null
  )
}

export function listAnalysisRuns(jobApplicationId: number): ApplicationAnalysisRun[] {
  return db
    .select({ run: applicationAnalysisRuns })
    .from(applicationAnalysisRuns)
    .innerJoin(
      jobPostingAnalyses,
      eq(applicationAnalysisRuns.jobPostingAnalysisId, jobPostingAnalyses.id),
    )
    .innerJoin(jobPostings, eq(jobPostingAnalyses.jobPostingId, jobPostings.id))
    .where(eq(jobPostings.jobApplicationId, jobApplicationId))
    .orderBy(desc(applicationAnalysisRuns.id))
    .all()
    .map((row) => row.run)
}

export function listQueuedAnalysisRuns() {
  return db
    .select()
    .from(applicationAnalysisRuns)
    .where(eq(applicationAnalysisRuns.status, 'Queued'))
    .orderBy(applicationAnalysisRuns.id)
    .all()
}

export function findReusableAnalysisRun(jobApplicationId: number, inputHash: string) {
  return (
    db
      .select({ run: applicationAnalysisRuns })
      .from(applicationAnalysisRuns)
      .innerJoin(
        jobPostingAnalyses,
        eq(applicationAnalysisRuns.jobPostingAnalysisId, jobPostingAnalyses.id),
      )
      .innerJoin(jobPostings, eq(jobPostingAnalyses.jobPostingId, jobPostings.id))
      .where(
        and(
          eq(jobPostings.jobApplicationId, jobApplicationId),
          eq(applicationAnalysisRuns.inputHash, inputHash),
          sql`${applicationAnalysisRuns.status} in ('Queued', 'Processing')`,
        ),
      )
      .orderBy(desc(applicationAnalysisRuns.id))
      .get()?.run ?? null
  )
}

export function latestCompletedAnalysisRun(jobApplicationId: number) {
  return (
    db
      .select({ run: applicationAnalysisRuns })
      .from(applicationAnalysisRuns)
      .innerJoin(
        jobPostingAnalyses,
        eq(applicationAnalysisRuns.jobPostingAnalysisId, jobPostingAnalyses.id),
      )
      .innerJoin(jobPostings, eq(jobPostingAnalyses.jobPostingId, jobPostings.id))
      .where(
        and(
          eq(jobPostings.jobApplicationId, jobApplicationId),
          eq(applicationAnalysisRuns.status, 'Completed'),
        ),
      )
      .orderBy(desc(applicationAnalysisRuns.id))
      .get()?.run ?? null
  )
}

export function markAnalysisRunProcessing(runId: number) {
  const date = todayISO()
  db.update(applicationAnalysisRuns)
    .set({
      status: 'Processing',
      attempts: sql`${applicationAnalysisRuns.attempts} + 1`,
      errorMessage: null,
      startedAt: date,
      updatedAt: date,
    })
    .where(eq(applicationAnalysisRuns.id, runId))
    .run()
}

export function completeAnalysisRun(
  runId: number,
  resultJson: string,
  recommendedProfileId: string | null,
) {
  const date = todayISO()
  return db.transaction((tx) => {
    const run = tx
      .select()
      .from(applicationAnalysisRuns)
      .where(eq(applicationAnalysisRuns.id, runId))
      .get()
    if (!run) return
    tx.update(applicationAnalysisRuns)
      .set({
        status: 'Completed',
        resultJson,
        recommendedProfileId,
        errorMessage: null,
        completedAt: date,
        updatedAt: date,
      })
      .where(eq(applicationAnalysisRuns.id, runId))
      .run()

    // A new run starts pending for every current missing canonical skill. The
    // missing set derives from the exact Job Analysis run's requirement-skill
    // mappings where the skill is not in career data; prior decisions remain
    // suggestions only and must be explicitly reconfirmed. Legacy runs without
    // explicit lineage seed no decisions.
    const jobPostingAnalysisId = run.jobPostingAnalysisId
    if (jobPostingAnalysisId !== null) {
      const missingSkillIds = [
        ...new Set(
          tx
            .select({ skillId: jobRequirementsToSkills.skillId })
            .from(jobRequirementsToSkills)
            .innerJoin(
              jobRequirements,
              eq(jobRequirements.id, jobRequirementsToSkills.jobRequirementId),
            )
            .innerJoin(skills, eq(skills.id, jobRequirementsToSkills.skillId))
            .where(
              and(
                eq(jobRequirements.jobPostingAnalysisId, jobPostingAnalysisId),
                isNull(skills.careerSkillId),
              ),
            )
            .all()
            .map((row) => row.skillId),
        ),
      ]
      seedPendingRunDecisions(tx, runId, missingSkillIds)
    }
  })
}

export function failAnalysisRun(runId: number, error: unknown) {
  const message = error instanceof Error ? error.message : 'Candidate analysis failed.'
  db.update(applicationAnalysisRuns)
    .set({ status: 'Failed', errorMessage: message.slice(0, 2000), updatedAt: todayISO() })
    .where(eq(applicationAnalysisRuns.id, runId))
    .run()
}

export function confirmProfileSelection(runId: number, profileId: string) {
  const date = todayISO()
  return db.transaction((tx) => {
    const run = tx
      .select()
      .from(applicationAnalysisRuns)
      .where(eq(applicationAnalysisRuns.id, runId))
      .get()
    if (!run || run.status !== 'Completed') return false
    tx.update(applicationAnalysisRuns)
      .set({ confirmedProfileId: profileId, profileConfirmedAt: date, updatedAt: date })
      .where(eq(applicationAnalysisRuns.id, runId))
      .run()
    const jobApplicationId = applicationIdForAnalysisRun(runId)
    if (jobApplicationId !== null)
      tx.update(jobApplications)
        .set({ direction: profileId, updatedAt: date })
        .where(eq(jobApplications.id, jobApplicationId))
        .run()
    return true
  })
}

export function analysisRunBelongsToApplication(runId: number, jobApplicationId: number) {
  return applicationIdForAnalysisRun(runId) === jobApplicationId
}
