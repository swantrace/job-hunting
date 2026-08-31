import { describe, expect, test } from 'bun:test'
import { assessApplicationReadiness } from '../src/lib/application-readiness'

describe('application generation readiness', () => {
  test('returns a structured reason list for each blocking condition', () => {
    const result = assessApplicationReadiness({
      hasReviewedAnalysis: false,
      analysisStatus: 'none',
      profileConfirmed: false,
      hasPendingSkillDecisions: true,
    })

    expect(result.ready).toBe(false)
    expect(result.reasons).toContain('Analyze this application first.')
    expect(result.reasons).toContain('Confirm a generation profile first.')
    expect(result.reasons).toContain(
      'Resolve every unverified-skill decision before generating documents.',
    )
  })

  test('blocks generation when the latest analysis is stale', () => {
    const result = assessApplicationReadiness({
      hasReviewedAnalysis: true,
      analysisStatus: 'stale',
      profileConfirmed: true,
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
        profileConfirmed: true,
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
      profileConfirmed: true,
      hasPendingSkillDecisions: false,
    })

    expect(result.ready).toBe(false)
    expect(result.reasons).toContain('Run candidate analysis to completion first.')
  })

  test('is ready only when every condition is satisfied', () => {
    const result = assessApplicationReadiness({
      hasReviewedAnalysis: true,
      analysisStatus: 'completed',
      profileConfirmed: true,
      hasPendingSkillDecisions: false,
    })

    expect(result.ready).toBe(true)
    expect(result.reasons).toEqual([])
  })
})
