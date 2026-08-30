import { and, desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { todayISO } from '../lib/date'
import type { db } from './client'
import {
  type AnalysisRunDecision,
  analysisRunDecisions,
  applicationAnalysisRuns,
  jobPostingAnalyses,
  jobPostings,
} from './schema'

export type DecisionDb = Pick<typeof db, 'select' | 'insert' | 'delete' | 'update'>

export const runDecisionSchema = z
  .object({
    decision: z.enum(['pending', 'skip', 'include']),
    reason: z.string().trim().max(2000).nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.decision === 'include' && (!value.reason || value.reason.trim() === ''))
      ctx.addIssue({
        code: 'custom',
        message: 'A reason is required to include this skill.',
        path: ['reason'],
      })
  })

export type RunDecisionInput = z.infer<typeof runDecisionSchema>

export function listRunDecisions(db: DecisionDb, runId: number): AnalysisRunDecision[] {
  return db
    .select()
    .from(analysisRunDecisions)
    .where(eq(analysisRunDecisions.applicationAnalysisRunId, runId))
    .orderBy(analysisRunDecisions.id)
    .all()
}

export function getRunDecision(
  db: DecisionDb,
  runId: number,
  skillId: number,
): AnalysisRunDecision | null {
  return (
    db
      .select()
      .from(analysisRunDecisions)
      .where(
        and(
          eq(analysisRunDecisions.applicationAnalysisRunId, runId),
          eq(analysisRunDecisions.skillId, skillId),
        ),
      )
      .get() ?? null
  )
}

/**
 * Latest prior decision for a skill, matched by canonical skill ID and
 * restricted to the same application lineage (Job Analysis -> Job Post ->
 * application), never across unrelated applications.
 */
export function findPriorDecision(db: DecisionDb, runId: number, skillId: number) {
  const lineage = db
    .select({ jobApplicationId: jobPostings.jobApplicationId })
    .from(applicationAnalysisRuns)
    .innerJoin(
      jobPostingAnalyses,
      eq(applicationAnalysisRuns.jobPostingAnalysisId, jobPostingAnalyses.id),
    )
    .innerJoin(jobPostings, eq(jobPostingAnalyses.jobPostingId, jobPostings.id))
    .where(eq(applicationAnalysisRuns.id, runId))
    .get()
  if (!lineage) return null
  return (
    db
      .select({
        id: analysisRunDecisions.id,
        applicationAnalysisRunId: analysisRunDecisions.applicationAnalysisRunId,
        skillId: analysisRunDecisions.skillId,
        decision: analysisRunDecisions.decision,
        reason: analysisRunDecisions.reason,
        previousDecisionId: analysisRunDecisions.previousDecisionId,
        createdAt: analysisRunDecisions.createdAt,
        updatedAt: analysisRunDecisions.updatedAt,
      })
      .from(analysisRunDecisions)
      .innerJoin(
        applicationAnalysisRuns,
        eq(analysisRunDecisions.applicationAnalysisRunId, applicationAnalysisRuns.id),
      )
      .innerJoin(
        jobPostingAnalyses,
        eq(applicationAnalysisRuns.jobPostingAnalysisId, jobPostingAnalyses.id),
      )
      .innerJoin(jobPostings, eq(jobPostingAnalyses.jobPostingId, jobPostings.id))
      .where(
        and(
          eq(jobPostings.jobApplicationId, lineage.jobApplicationId),
          eq(analysisRunDecisions.skillId, skillId),
          sql`${analysisRunDecisions.applicationAnalysisRunId} < ${runId}`,
        ),
      )
      .orderBy(desc(analysisRunDecisions.id))
      .get() ?? null
  )
}

/** Creates pending rows for a run's current missing skills; existing rows kept. */
export function seedPendingRunDecisions(db: DecisionDb, runId: number, skillIds: number[]) {
  const date = todayISO()
  for (const skillId of skillIds) {
    db.insert(analysisRunDecisions)
      .values({
        applicationAnalysisRunId: runId,
        skillId,
        decision: 'pending',
        reason: null,
        createdAt: date,
        updatedAt: date,
      })
      .onConflictDoNothing()
      .run()
  }
}

export function upsertRunDecision(
  db: DecisionDb,
  input: {
    runId: number
    skillId: number
    decision: 'pending' | 'skip' | 'include'
    reason: string | null
    previousDecisionId?: number | null
  },
) {
  const date = todayISO()
  const previous =
    input.previousDecisionId === undefined
      ? (findPriorDecision(db, input.runId, input.skillId)?.id ?? null)
      : input.previousDecisionId
  const reason = input.decision === 'include' ? (input.reason ?? null) : null
  db.insert(analysisRunDecisions)
    .values({
      applicationAnalysisRunId: input.runId,
      skillId: input.skillId,
      decision: input.decision,
      reason,
      previousDecisionId: previous,
      createdAt: date,
      updatedAt: date,
    })
    .onConflictDoUpdate({
      target: [analysisRunDecisions.applicationAnalysisRunId, analysisRunDecisions.skillId],
      set: { decision: input.decision, reason, previousDecisionId: previous, updatedAt: date },
    })
    .run()
}

export function hasPendingRunDecisions(db: DecisionDb, runId: number) {
  return !!db
    .select({ id: analysisRunDecisions.id })
    .from(analysisRunDecisions)
    .where(
      and(
        eq(analysisRunDecisions.applicationAnalysisRunId, runId),
        eq(analysisRunDecisions.decision, 'pending'),
      ),
    )
    .limit(1)
    .get()
}
