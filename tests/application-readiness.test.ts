import { describe, expect, test } from 'bun:test'
import { assessApplicationReadiness } from '../src/lib/application-readiness'

describe('application generation readiness', () => {
  test('returns a structured reason list for each blocking condition', () => {
    const result = assessApplicationReadiness({
      hasReviewedAnalysis: false,
      analysisStatus: 'none',
      hasPendingSkillDecisions: true,
    })

    expect(result.ready).toBe(false)
    expect(result.reasons).toContain('Analyze this application first.')
    expect(result.reasons).toContain(
      'Resolve every missing-skill decision before generating documents.',
    )
  })

  test('blocks generation when the latest analysis is stale', () => {
    const result = assessApplicationReadiness({
      hasReviewedAnalysis: true,
      analysisStatus: 'stale',
      hasPendingSkillDecisions: false,
    })

    expect(result.ready).toBe(false)
    expect(result.reasons.some((reason) => /stale/.test(reason))).toBe(true)
  })

  test('blocks generation while a candidate analysis is still queued or processing', () => {
    for (const analysisStatus of ['queued', 'processing'] as const) {
      const result = assessApplicationReadiness({
        hasReviewedAnalysis: true,
        analysisStatus,
        hasPendingSkillDecisions: false,
      })

      expect(result.ready).toBe(false)
      expect(result.reasons).toContain('Run candidate analysis to completion first.')
    }
  })

  test('blocks generation after a failed candidate analysis instead of hiding it', () => {
    const result = assessApplicationReadiness({
      hasReviewedAnalysis: true,
      analysisStatus: 'failed',
      hasPendingSkillDecisions: false,
    })

    expect(result.ready).toBe(false)
    expect(result.reasons).toContain('Run candidate analysis to completion first.')
  })

  test('is ready only when every condition is satisfied', () => {
    const result = assessApplicationReadiness({
      hasReviewedAnalysis: true,
      analysisStatus: 'completed',
      hasPendingSkillDecisions: false,
    })

    expect(result.ready).toBe(true)
    expect(result.reasons).toEqual([])
  })
})
