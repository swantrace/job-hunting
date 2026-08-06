import { describe, expect, test } from 'bun:test'
import type { GenerationSource } from '../src/db/generation'
import { loadCareerData } from '../src/lib/career-data'
import { buildEvidenceSelectionSnapshot } from '../src/lib/evidence-selection'

describe('evidence selection snapshots', () => {
  test('selects only profile-approved, safe canonical evidence', () => {
    const data = loadCareerData()
    const profile = data.profiles.find((item) => item.id === 'fullstack')
    if (!profile) throw new Error('Expected the fullstack profile.')
    const conditionalSkill = profile.conditionalSkillIds[0]
    const snapshot = buildEvidenceSelectionSnapshot({
      run: { id: 99 },
      application: { id: 7, direction: 'fullstack', jobTitle: 'Full-Stack Developer' },
      skills: conditionalSkill ? [conditionalSkill] : [],
      analysis: { requirements: conditionalSkill ?? '' },
    } as GenerationSource)
    expect(snapshot.selection.experienceIds).toEqual(profile.experienceSelection.priorityOrder)
    expect(snapshot.selection.achievementIds).toEqual(
      profile.preferredAchievementIds.filter(
        (id) =>
          data.achievements.achievements.find((achievement) => achievement.id === id)?.safeToUse,
      ),
    )
    expect(snapshot.selection.matchedConditionalSkillIds).toEqual(
      conditionalSkill ? [conditionalSkill] : [],
    )
    expect(snapshot.selection.preferredSkillIds).toEqual(profile.preferredSkillIds)
    expect(snapshot.sourceVersions.profile).toBeGreaterThan(0)
    expect(snapshot.profile.id).toBe('fullstack')
  })
})
