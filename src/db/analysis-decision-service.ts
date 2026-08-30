import { listRunDecisions, upsertRunDecision } from './analysis-decisions'
import { db } from './client'

/**
 * Singleton-backed run-scoped decision operations for the Review routes.
 * Kept separate from the dependency-injected `analysis-decisions` service so
 * route code never opens the database directly and can be mocked in UI tests.
 */
export function skipRemainingRunDecisions(runId: number) {
  for (const decision of listRunDecisions(db, runId)) {
    if (decision.decision === 'pending') {
      upsertRunDecision(db, { runId, skillId: decision.skillId, decision: 'skip', reason: null })
    }
  }
}

export function decideRunSkill(input: {
  runId: number
  skillId: number
  decision: 'skip' | 'include'
  reason: string | null
}) {
  upsertRunDecision(db, {
    runId: input.runId,
    skillId: input.skillId,
    decision: input.decision,
    reason: input.reason,
  })
}
