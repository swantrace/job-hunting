import { describe, expect, test } from 'bun:test'
import type { CanonicalCareerData } from '../../src/lib/career-data'
import { determineMatchResult, hasUsableEvidence } from '../../src/lib/skills/match-career-skills'

const data = {
  skills: {
    skills: [
      {
        id: 'nodejs',
        label: 'Node.js',
        category: 'backend-apis',
        aliases: [],
        directions: [],
        evidence: ['experience:example'],
      },
      {
        id: 'react',
        label: 'React',
        category: 'frontend',
        aliases: [],
        directions: [],
        evidence: [],
      },
      {
        id: 'vue',
        label: 'Vue',
        category: 'frontend',
        aliases: [],
        directions: [],
        evidence: ['experience:example'],
        resumeEligible: false,
      },
    ],
  },
} as unknown as Pick<CanonicalCareerData, 'skills'>

describe('deterministic career matching', () => {
  test('proven-match requires canonical identity and usable evidence', () => {
    expect(determineMatchResult('nodejs', data)).toBe('proven-match')
    expect(determineMatchResult('react', data)).toBe('not-in-career-data')
    expect(determineMatchResult('vue', data)).toBe('not-in-career-data')
    expect(determineMatchResult('unknown', data)).toBe('not-in-career-data')
    expect(determineMatchResult(null, data)).toBe('not-in-career-data')
  })

  test('does not match by broad category equality', () => {
    // React and Vue share the frontend category but are distinct identities.
    expect(determineMatchResult('react', data)).toBe('not-in-career-data')
    expect(determineMatchResult('vue', data)).toBe('not-in-career-data')
    expect(determineMatchResult('nodejs', data)).toBe('proven-match')
  })

  test('hasUsableEvidence honors resume eligibility and evidence presence', () => {
    expect(hasUsableEvidence({ evidence: [] })).toBe(false)
    expect(hasUsableEvidence({ evidence: ['experience:example'] })).toBe(true)
    expect(hasUsableEvidence({ evidence: ['experience:example'], resumeEligible: false })).toBe(
      false,
    )
  })
})
