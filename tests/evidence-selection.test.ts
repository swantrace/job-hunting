import { describe, expect, test } from 'bun:test'
import type { GenerationSource } from '../src/db/generation'
import { buildEvidenceSelectionSnapshot } from '../src/lib/evidence-selection'

describe('evidence selection snapshots', () => {
  test('selects only profile-approved, safe canonical evidence', () => {
    const snapshot = buildEvidenceSelectionSnapshot({
      run: { id: 99 },
      application: { id: 7, direction: 'fullstack', jobTitle: 'Full-Stack Developer' },
      skills: ['TypeScript', 'FHIR'],
      analysis: { requirements: 'TypeScript\nFHIR' },
    } as GenerationSource)
    expect(snapshot.selection.experienceIds[0]).toBe('shift')
    expect(snapshot.selection.achievementIds).toContain('midato-vite-ci')
    expect(snapshot.selection.matchedConditionalSkillIds).toContain('fhir')
    expect(snapshot.selection.excludedUnsafeAchievementIds).toEqual([])
    expect(snapshot.sourceVersions.profile).toBeGreaterThan(0)
    expect(snapshot.profile.id).toBe('fullstack')
  })
})
