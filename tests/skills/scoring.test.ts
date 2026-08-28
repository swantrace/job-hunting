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
})
