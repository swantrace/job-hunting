import { describe, expect, test } from 'bun:test'
import { candidateStalenessReasons } from '../../src/lib/candidate-analysis'

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    version: 2,
    jobAnalysis: { runId: 1, summary: {}, classification: {}, requirements: [] },
    careerData: { candidate: { name: 'Ada' } },
    profiles: [{ id: 'fullstack' }],
    ...overrides,
  }
}

describe('candidate staleness reason codes', () => {
  test('returns no reasons for identical inputs', () => {
    expect(candidateStalenessReasons(snapshot(), snapshot())).toEqual([])
  })

  test('detects job-analysis changes', () => {
    const reasons = candidateStalenessReasons(snapshot(), snapshot({ jobAnalysis: { runId: 2 } }))
    expect(reasons).toContain('job-analysis-changed')
    expect(reasons).not.toContain('career-data-changed')
  })

  test('detects career-data changes', () => {
    const reasons = candidateStalenessReasons(
      snapshot(),
      snapshot({ careerData: { candidate: { name: 'Grace' } } }),
    )
    expect(reasons).toContain('career-data-changed')
  })

  test('detects profile changes', () => {
    const reasons = candidateStalenessReasons(
      snapshot(),
      snapshot({ profiles: [{ id: 'frontend' }] }),
    )
    expect(reasons).toContain('profiles-changed')
  })

  test('detects contract version changes', () => {
    const reasons = candidateStalenessReasons(snapshot(), snapshot({ version: 1 }))
    expect(reasons).toContain('candidate-contract-changed')
  })

  test('reports every changed boundary at once', () => {
    const reasons = candidateStalenessReasons(
      snapshot(),
      snapshot({
        version: 1,
        jobAnalysis: { runId: 3 },
        careerData: { candidate: { name: 'Grace' } },
        profiles: [{ id: 'frontend' }],
      }),
    )
    expect(reasons).toEqual(
      expect.arrayContaining([
        'job-analysis-changed',
        'career-data-changed',
        'profiles-changed',
        'candidate-contract-changed',
      ]),
    )
  })
})
