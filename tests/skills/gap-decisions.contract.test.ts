import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import * as validation from '../../src/lib/validation'

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
