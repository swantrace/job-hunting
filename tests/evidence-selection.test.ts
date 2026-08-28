import { describe, expect, test } from 'bun:test'
import type { GenerationSource } from '../src/db/generation'
import { loadCareerData } from '../src/lib/career-data'
import {
  buildEvidenceSelectionSnapshot,
  evidenceSelectionSnapshotSchema,
} from '../src/lib/evidence-selection'

function requirement(overrides: Record<string, unknown> = {}) {
  return {
    jobApplicationId: 7,
    skillId: 1,
    rawLabel: 'Kafka',
    sourceText: 'Experience building event-driven systems with Kafka',
    importance: 'required',
    parserConfidence: 0.9,
    analysisResult: 'not-in-career-data',
    userDecision: 'pending',
    decisionReason: null,
    createdAt: '2026-08-28',
    updatedAt: '2026-08-28',
    skillName: 'Kafka',
    skillKey: 'kafka',
    skillCategory: 'messaging-async',
    careerSkillId: null,
    reviewStatus: 'pending',
    aliases: [],
    ...overrides,
  }
}

function sourceWithRequirements(requirements: ReturnType<typeof requirement>[]) {
  return {
    run: { id: 99 },
    application: { id: 7, direction: 'fullstack', jobTitle: 'Full-Stack Developer' },
    company: { id: 1, name: 'Acme', website: null, createdAt: '2026-08-28' },
    skills: requirements.map((item) => item.skillName),
    requirements,
    jobPosting: undefined,
    analysis: { requirements: '' },
  } as unknown as GenerationSource
}

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

  test('freezes every JD skill requirement with its match result and user decision', () => {
    const snapshot = buildEvidenceSelectionSnapshot(
      sourceWithRequirements([
        requirement({ skillId: 1, skillName: 'TypeScript', analysisResult: 'proven-match' }),
        requirement({
          skillId: 2,
          skillName: 'Kafka',
          analysisResult: 'not-in-career-data',
          userDecision: 'skip',
        }),
      ]),
    )
    expect(snapshot.skillRequirements).toHaveLength(2)
    expect(snapshot.skillRequirements).toContainEqual(
      expect.objectContaining({ skillName: 'TypeScript', analysisResult: 'proven-match' }),
    )
    expect(snapshot.skillRequirements).toContainEqual(
      expect.objectContaining({ skillName: 'Kafka', userDecision: 'skip' }),
    )
  })

  test('retains skipped skills as gaps while excluding them from document inputs', () => {
    const snapshot = buildEvidenceSelectionSnapshot(
      sourceWithRequirements([
        requirement({
          skillId: 2,
          skillName: 'Kafka',
          analysisResult: 'not-in-career-data',
          userDecision: 'skip',
        }),
        requirement({ skillId: 1, skillName: 'TypeScript', analysisResult: 'proven-match' }),
      ]),
    )
    expect(snapshot.skillRequirements.map((item) => item.userDecision)).toContain('skip')
    expect(snapshot.provenance.map((item) => item.skillName)).toEqual(['TypeScript'])
  })

  test('records the mandatory application-only reason as skill provenance', () => {
    const snapshot = buildEvidenceSelectionSnapshot(
      sourceWithRequirements([
        requirement({
          skillId: 3,
          skillName: 'Kafka',
          analysisResult: 'not-in-career-data',
          userDecision: 'include',
          decisionReason: 'Used in a personal event-processing prototype.',
        }),
      ]),
    )
    expect(snapshot.provenance).toContainEqual({
      skillName: 'Kafka',
      source: 'application-only',
      reason: 'Used in a personal event-processing prototype.',
    })
  })

  test('parses existing version 1 snapshots after the skill snapshot schema is upgraded', () => {
    const v1 = {
      version: 1,
      generatedAt: '2026-08-28',
      generationRunId: 1,
      application: { id: 1, direction: 'fullstack', jobTitle: 'Engineer' },
      sourceVersions: {
        candidate: 1,
        experiences: 1,
        achievements: 1,
        publications: 1,
        projects: 1,
        skills: 1,
        stories: 1,
        profile: 1,
      },
      profile: { id: 'fullstack', lastUpdated: '2026-01-01' },
      selection: {
        experienceIds: [],
        achievementIds: [],
        publicationIds: [],
        projectIds: [],
        preferredSkillIds: [],
        matchedConditionalSkillIds: [],
        storyIds: [],
        excludedUnsafeAchievementIds: [],
      },
      facts: {
        candidate: {},
        experiences: [],
        achievements: [],
        publications: [],
        projects: [],
        skills: [],
        stories: [],
      },
    }
    const parsed = evidenceSelectionSnapshotSchema.parse(v1)
    expect(parsed.skillRequirements).toEqual([])
    expect(parsed.provenance).toEqual([])
    expect(parsed.scores).toBeUndefined()
  })
})
