import { describe, expect, test } from 'bun:test'
import { calculateSkillScores } from '../../src/lib/skills/score'

describe('explainable skill scores', () => {
  test('keeps canonical match separate from application coverage', () => {
    const result = calculateSkillScores([
      { analysisResult: 'proven-match', importance: 'required', userDecision: 'pending' },
      { analysisResult: 'not-in-career-data', importance: 'required', userDecision: 'include' },
      { analysisResult: 'not-in-career-data', importance: 'preferred', userDecision: 'skip' },
      { analysisResult: 'not-in-career-data', importance: 'mentioned', userDecision: 'pending' },
    ])

    expect(result.canonicalMatch.matchedWeight).toBe(3)
    expect(result.canonicalMatch.totalWeight).toBe(7)
    expect(result.canonicalMatch.percentage).toBeCloseTo(42.857, 2)
    expect(result.applicationCoverage.matchedWeight).toBe(6)
    expect(result.applicationCoverage.totalWeight).toBe(7)
    expect(result.applicationCoverage.percentage).toBeCloseTo(85.714, 2)
  })

  test('excludes mentioned skills from the denominator', () => {
    const result = calculateSkillScores([
      { analysisResult: 'not-in-career-data', importance: 'mentioned', userDecision: 'skip' },
    ])
    expect(result.canonicalMatch.totalWeight).toBe(0)
    expect(result.canonicalMatch.percentage).toBeNull()
    expect(result.applicationCoverage.percentage).toBeNull()
  })

  test('include raises coverage but never canonical match', () => {
    const result = calculateSkillScores([
      { analysisResult: 'not-in-career-data', importance: 'required', userDecision: 'include' },
    ])
    expect(result.canonicalMatch.matchedWeight).toBe(0)
    expect(result.applicationCoverage.matchedWeight).toBe(3)
  })

  test('counts a canonical skill mapped to multiple requirements once', async () => {
    const { calculateDeduplicatedSkillCoverage } = (await import('../../src/lib/skills/score')) as {
      calculateDeduplicatedSkillCoverage: (
        rows: Array<{
          skillId: number
          analysisResult: string
          importance: string
          userDecision: string
        }>,
      ) => {
        canonicalMatch: { matchedWeight: number; totalWeight: number; percentage: number | null }
        applicationCoverage: {
          matchedWeight: number
          totalWeight: number
          percentage: number | null
        }
      }
    }
    const result = calculateDeduplicatedSkillCoverage([
      {
        skillId: 5,
        analysisResult: 'proven-match',
        importance: 'required',
        userDecision: 'pending',
      },
      {
        skillId: 5,
        analysisResult: 'proven-match',
        importance: 'required',
        userDecision: 'pending',
      },
      {
        skillId: 6,
        analysisResult: 'not-in-career-data',
        importance: 'preferred',
        userDecision: 'skip',
      },
    ])

    // Skill 5 appears on two rows but contributes its required weight once.
    expect(result.canonicalMatch.totalWeight).toBe(4)
    expect(result.canonicalMatch.matchedWeight).toBe(3)
    expect(result.applicationCoverage.totalWeight).toBe(4)
    expect(result.applicationCoverage.matchedWeight).toBe(3)
  })
})
