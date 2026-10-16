import { and, desc, eq, sql } from 'drizzle-orm'
import { nowISO, todayISO } from '../lib/date'
import { careerSkillKeys } from '../lib/skills/runtime-career-skills'
import { findPriorDecision, seedPendingRunDecisions, upsertRunDecision } from './analysis-decisions'
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
import { listRunSkillReviews } from './skill-queries'

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

/** Resets runs orphaned mid-flight by a crashed worker back to Queued. */
export function resetStaleProcessingAnalysisRuns() {
  db.update(applicationAnalysisRuns)
    .set({ status: 'Queued', errorMessage: null, updatedAt: todayISO() })
    .where(eq(applicationAnalysisRuns.status, 'Processing'))
    .run()
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
  const date = nowISO()
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

export function completeAnalysisRun(runId: number, resultJson: string) {
  const date = todayISO()
  return db.transaction((tx) => {
    const run = tx
      .select()
      .from(applicationAnalysisRuns)
      .where(eq(applicationAnalysisRuns.id, runId))
      .get()
    if (!run || run.status === 'Completed') return
    tx.update(applicationAnalysisRuns)
      .set({
        status: 'Completed',
        resultJson,
        errorMessage: null,
        completedAt: date,
        updatedAt: date,
      })
      .where(eq(applicationAnalysisRuns.id, runId))
      .run()

    // A new run starts pending for every current missing canonical skill. The
    // missing set derives from the exact Job Analysis run's requirement-skill
    // mappings and frozen personal evidence. Reuse an explicit prior choice
    // only when its per-skill evidence/requirement fingerprint still matches.
    // Legacy runs without explicit lineage seed no decisions.
    const jobPostingAnalysisId = run.jobPostingAnalysisId
    if (jobPostingAnalysisId !== null) {
      const missingReviews = listRunSkillReviews(runId, tx).filter(
        (row) => row.analysisResult === 'not-in-career-data',
      )
      seedPendingRunDecisions(
        tx,
        runId,
        missingReviews.map((row) => row.skillId),
      )
      for (const review of missingReviews) {
        const prior = findPriorDecision(tx, runId, review.skillId)
        if (
          !prior ||
          prior.decision === 'pending' ||
          !review.decisionBasisHash ||
          prior.basisHash !== review.decisionBasisHash
        )
          continue
        if (prior.decision === 'include' && !prior.reason?.trim()) continue
        upsertRunDecision(tx, {
          runId,
          skillId: review.skillId,
          decision: prior.decision,
          reason: prior.reason,
          basisHash: review.decisionBasisHash,
          previousDecisionId: prior.id,
        })
      }
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

export function analysisRunBelongsToApplication(runId: number, jobApplicationId: number) {
  return applicationIdForAnalysisRun(runId) === jobApplicationId
}
