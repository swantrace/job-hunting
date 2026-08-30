import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from '../../src/db/schema'
import * as validation from '../../src/lib/validation'
import { migratedDatabase } from '../support/sqlite'

type SafeParseSchema = {
  safeParse: (value: unknown) => { success: boolean }
}

const decisionSchema = (validation as Record<string, unknown>).skillDecisionSchema as
  | SafeParseSchema
  | undefined
const decisionTest = decisionSchema ? test : test.todo
const scoreModule = resolve(process.cwd(), 'src/lib/skills/score.ts')
const scoreTest = existsSync(scoreModule) ? test : test.todo

type ScoreModule = {
  calculateSkillScores: (requirements: unknown[]) => {
    applicationCoverage: { matchedWeight: number; percentage: number | null; totalWeight: number }
    canonicalMatch: { matchedWeight: number; percentage: number | null; totalWeight: number }
  }
}

describe('planned application skill decision contract', () => {
  decisionTest('allows Skip without a reason', () => {
    expect(decisionSchema?.safeParse({ action: 'skip', reason: '' }).success).toBe(true)
  })

  decisionTest('requires a reason when a skill is included for one application', () => {
    expect(decisionSchema?.safeParse({ action: 'include', reason: '' }).success).toBe(false)
    expect(
      decisionSchema?.safeParse({
        action: 'include',
        reason: 'Used Kafka in a personal event-processing prototype with retry handling.',
      }).success,
    ).toBe(true)
  })

  decisionTest('rejects invented third choices', () => {
    for (const action of ['exclude', 'add-to-career-data', 'partial-match']) {
      expect(decisionSchema?.safeParse({ action, reason: 'Forged option' }).success).toBe(false)
    }
  })
})

describe('planned explainable skill score contract', () => {
  scoreTest('keeps canonical match separate from application coverage', async () => {
    const { calculateSkillScores } = (await import(scoreModule)) as ScoreModule
    const result = calculateSkillScores([
      {
        analysisResult: 'proven-match',
        importance: 'required',
        userDecision: 'pending',
      },
      {
        analysisResult: 'not-in-career-data',
        importance: 'required',
        userDecision: 'include',
      },
      {
        analysisResult: 'not-in-career-data',
        importance: 'preferred',
        userDecision: 'skip',
      },
      {
        analysisResult: 'not-in-career-data',
        importance: 'mentioned',
        userDecision: 'pending',
      },
    ])

    expect(result.canonicalMatch).toEqual({
      matchedWeight: 3,
      percentage: expect.closeTo(42.857, 2),
      totalWeight: 7,
    })
    expect(result.applicationCoverage).toEqual({
      matchedWeight: 6,
      percentage: expect.closeTo(85.714, 2),
      totalWeight: 7,
    })
  })

  scoreTest('returns no percentage when there are no weighted requirements', async () => {
    const { calculateSkillScores } = (await import(scoreModule)) as ScoreModule
    const result = calculateSkillScores([
      {
        analysisResult: 'not-in-career-data',
        importance: 'mentioned',
        userDecision: 'skip',
      },
    ])

    expect(result.canonicalMatch.percentage).toBeNull()
    expect(result.applicationCoverage.percentage).toBeNull()
  })
})

const analysisDecisionsPath = resolve(process.cwd(), 'src/db/analysis-decisions.ts')
const runDecisionTest = existsSync(analysisDecisionsPath) ? test : test.todo

describe('planned run-scoped skill decision contract', () => {
  runDecisionTest(
    'validates pending, skip, and include with a mandatory include reason',
    async () => {
      const { runDecisionSchema } = await import(analysisDecisionsPath)
      expect(runDecisionSchema.safeParse({ decision: 'pending', reason: null }).success).toBe(true)
      expect(runDecisionSchema.safeParse({ decision: 'skip', reason: null }).success).toBe(true)
      expect(runDecisionSchema.safeParse({ decision: 'include', reason: '' }).success).toBe(false)
      expect(
        runDecisionSchema.safeParse({
          decision: 'include',
          reason: 'Used Kafka in a personal event-processing prototype.',
        }).success,
      ).toBe(true)
      expect(runDecisionSchema.safeParse({ decision: 'exclude' }).success).toBe(false)
    },
  )

  runDecisionTest(
    'scopes decisions to a candidate analysis run without auto-accepting',
    async () => {
      const sqlite = migratedDatabase()
      try {
        const db = drizzle({ client: sqlite, schema })
        const { listRunDecisions, seedPendingRunDecisions, upsertRunDecision } = await import(
          analysisDecisionsPath
        )
        const runA = 1
        const runB = 2
        const skillId = 1

        seedPendingRunDecisions(db, runA, [skillId])
        expect(
          listRunDecisions(db, runA).map((item: { decision: string }) => item.decision),
        ).toEqual(['pending'])
        expect(listRunDecisions(db, runB)).toEqual([])

        upsertRunDecision(db, { runId: runA, skillId, decision: 'skip', reason: null })
        // A later run starts pending; the prior decision is a suggestion, not an
        // inherited state.
        seedPendingRunDecisions(db, runB, [skillId])
        expect(
          listRunDecisions(db, runB).map((item: { decision: string }) => item.decision),
        ).toEqual(['pending'])
      } finally {
        sqlite.close()
      }
    },
  )
})
