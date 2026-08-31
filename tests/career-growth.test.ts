import { describe, expect, test } from 'bun:test'
import {
  type CareerGrowthInputRow,
  careerGrowthScore,
  isActiveApplicationStatus,
  rankCareerGrowthOpportunities,
} from '../src/lib/career-growth'

const row = (overrides: Partial<CareerGrowthInputRow> = {}): CareerGrowthInputRow => ({
  skillKey: 'fhir',
  skillName: 'FHIR',
  category: null,
  directionCount: 1,
  activeApplicationCount: 1,
  requiredCount: 0,
  preferredCount: 0,
  mentionedCount: 0,
  verifiedEvidenceCount: 0,
  retainedCount: 0,
  latestActivityAt: '2026-08-31',
  ...overrides,
})

describe('career growth aggregation', () => {
  test('excludes Archived and Rejected statuses only', () => {
    expect(isActiveApplicationStatus('Saved')).toBe(true)
    expect(isActiveApplicationStatus('Applied')).toBe(true)
    expect(isActiveApplicationStatus('Rejected')).toBe(false)
    expect(isActiveApplicationStatus('Archived')).toBe(false)
  })

  test('deduplicates by canonical skill and merges counts', () => {
    const ranked = rankCareerGrowthOpportunities([
      row({ skillKey: 'fhir', requiredCount: 1, verifiedEvidenceCount: 1 }),
      row({ skillKey: 'fhir', preferredCount: 1, retainedCount: 1 }),
      row({ skillKey: 'typescript', requiredCount: 2 }),
    ])
    expect(ranked).toHaveLength(2)
    const fhir = ranked.find((item) => item.skillKey === 'fhir')
    expect(fhir?.requiredCount).toBe(1)
    expect(fhir?.preferredCount).toBe(1)
    expect(fhir?.verifiedEvidenceCount).toBe(1)
    expect(fhir?.retainedCount).toBe(1)
  })

  test('ranks recurring required skills above mentioned-only skills', () => {
    const ranked = rankCareerGrowthOpportunities([
      row({ skillKey: 'a', requiredCount: 2, activeApplicationCount: 3 }),
      row({ skillKey: 'b', mentionedCount: 1, activeApplicationCount: 1 }),
    ])
    expect(ranked[0].skillKey).toBe('a')
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score)
  })

  test('assigns deterministic neutral labels', () => {
    const verify = rankCareerGrowthOpportunities([
      row({ skillKey: 'a', requiredCount: 1, verifiedEvidenceCount: 1 }),
    ])[0]
    expect(verify.label).toBe('Verify existing evidence')

    const consider = rankCareerGrowthOpportunities([
      row({ skillKey: 'b', requiredCount: 1, verifiedEvidenceCount: 0 }),
    ])[0]
    expect(consider.label).toBe('Consider learning/project evidence')

    const low = rankCareerGrowthOpportunities([row({ skillKey: 'c', mentionedCount: 1 })])[0]
    expect(low.label).toBe('Low priority')
  })

  test('drops rows with no active applications and scores deterministically', () => {
    expect(rankCareerGrowthOpportunities([row({ activeApplicationCount: 0 })])).toEqual([])
    expect(careerGrowthScore(row({ activeApplicationCount: 1, requiredCount: 1 }))).toBe(
      1 * 10 + 3 + 0 + 1,
    )
  })
})
