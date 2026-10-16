import { upsertRunDecision } from './analysis-decisions'
import { db } from './client'
import { listRunSkillReviews } from './skill-queries'

/**
 * Singleton-backed run-scoped decision operations for the Review routes.
 * Kept separate from the dependency-injected `analysis-decisions` service so
 * route code never opens the database directly and can be mocked in UI tests.
 */
export function skipRemainingRunDecisions(runId: number) {
  for (const decision of listRunSkillReviews(runId)) {
    if (decision.analysisResult === 'proven-match') continue
    if (decision.decision === 'pending') {
      decideRunSkill({ runId, skillId: decision.skillId, decision: 'skip', reason: null })
    }
  }
}

export function decideRunSkill(input: {
  runId: number
  skillId: number
  decision: 'skip' | 'include'
  reason: string | null
}) {
  const review = listRunSkillReviews(input.runId).find((row) => row.skillId === input.skillId)
  if (!review || review.analysisResult === 'proven-match')
    throw new Error('This skill does not require a decision.')
  upsertRunDecision(db, {
    runId: input.runId,
    skillId: input.skillId,
    decision: input.decision,
    reason: input.reason,
    basisHash: review.decisionBasisHash,
  })
}
