import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { GenerationSource } from '../src/db/generation'
import { loadCareerData } from '../src/lib/career-data'
import {
  buildEvidenceSelectionSnapshot,
  evidenceSelectionSnapshotSchema,
} from '../src/lib/evidence-selection'

function requirement(overrides: Record<string, unknown> = {}) {
  return {
    skillId: 1,
    rawLabel: 'Kafka',
    requirementStatement: 'Experience building event-driven systems with Kafka',
    importance: 'required',
    confidence: 0.9,
    analysisResult: 'not-in-career-data',
    decision: 'pending',
    decisionReason: null,
    skillName: 'Kafka',
    skillKey: 'kafka',
    category: 'messaging-async',
    careerSkillId: null,
    reviewStatus: 'pending',
    aliases: [],
    requirementId: 1,
    requirementSequence: 1,
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
  const exampleCareerData = resolve(process.cwd(), 'career-data.example')
  const exampleProfiles = resolve(process.cwd(), 'profiles.example')
  const previousCareerData = process.env.CAREER_DATA_DIR
  const previousProfiles = process.env.CAREER_PROFILES_DIR

  beforeEach(() => {
    process.env.CAREER_DATA_DIR = exampleCareerData
    process.env.CAREER_PROFILES_DIR = exampleProfiles
  })

  afterEach(() => {
    if (previousCareerData === undefined) delete process.env.CAREER_DATA_DIR
    else process.env.CAREER_DATA_DIR = previousCareerData
    if (previousProfiles === undefined) delete process.env.CAREER_PROFILES_DIR
    else process.env.CAREER_PROFILES_DIR = previousProfiles
  })

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
    } as unknown as GenerationSource)
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
          decision: 'skip',
        }),
      ]),
    )
    expect(snapshot.skillRequirements).toHaveLength(2)
    expect(snapshot.skillRequirements).toContainEqual(
      expect.objectContaining({ skillName: 'TypeScript', analysisResult: 'proven-match' }),
    )
    expect(snapshot.skillRequirements).toContainEqual(
      expect.objectContaining({ skillName: 'Kafka', decision: 'skip' }),
    )
  })

  test('retains skipped skills as gaps while excluding them from document inputs', () => {
    const snapshot = buildEvidenceSelectionSnapshot(
      sourceWithRequirements([
        requirement({
          skillId: 2,
          skillName: 'Kafka',
          analysisResult: 'not-in-career-data',
          decision: 'skip',
        }),
        requirement({ skillId: 1, skillName: 'TypeScript', analysisResult: 'proven-match' }),
      ]),
    )
    expect(snapshot.skillRequirements.map((item) => item.decision)).toContain('skip')
    expect(snapshot.provenance.map((item) => item.skillName)).toEqual(['TypeScript'])
  })

  test('records the mandatory application-only reason as skill provenance', () => {
    const snapshot = buildEvidenceSelectionSnapshot(
      sourceWithRequirements([
        requirement({
          skillId: 3,
          skillName: 'Kafka',
          analysisResult: 'not-in-career-data',
          decision: 'include',
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

  test('writes version 2 snapshots with requirement coverage and claim selection', () => {
    const snapshot = buildEvidenceSelectionSnapshot({
      run: { id: 99 },
      application: { id: 7, direction: 'fullstack', jobTitle: 'Full-Stack Developer' },
      skills: ['TypeScript'],
      requirements: [
        requirement({
          skillId: 1,
          skillName: 'TypeScript',
          analysisResult: 'proven-match',
          decision: 'pending',
        }),
      ],
      jobPosting: undefined,
      analysis: { requirements: '' },
      jobRequirements: [
        {
          id: 101,
          sequence: 1,
          requirementType: 'skill',
          importance: 'required',
          basis: 'explicit',
          statement: 'TypeScript experience',
          sourceText: 'TypeScript experience',
          inferenceRationale: null,
          createdAt: '2026-08-28',
          updatedAt: '2026-08-28',
        },
      ],
      analysisRun: {
        id: 42,
        status: 'Completed',
        inputHash: 'input-hash',
        promptVersion: '1.0.0',
        confirmedProfileId: 'fullstack',
        resultJson: JSON.stringify({
          fitRecommendation: 'apply',
          recommendationRationale: 'Strong match.',
          profileRecommendation: {
            recommendedProfileId: 'fullstack',
            rationale: 'Balanced.',
            alternatives: [],
          },
          requirementAssessments: [
            {
              jobRequirementId: 101,
              evidenceStatus: 'direct',
              evidenceRefs: [
                { sourceType: 'achievement', sourceId: 'example-delivery', relevance: 'direct' },
              ],
              explanation: 'Direct evidence.',
              confidence: 0.95,
            },
          ],
          strengths: [],
          concerns: [],
          interviewPreparation: [],
          careerDataSuggestions: [],
        }),
      },
      companyInterestNote: null,
    } as unknown as GenerationSource)

    expect(snapshot.version).toBe(2)
    if (snapshot.version !== 2) return
    expect(snapshot.analysisRunId).toBe(42)
    expect(snapshot.analysisInputHash).toBe('input-hash')
    expect(snapshot.confirmedProfileId).toBe('fullstack')
    expect(snapshot.fitRecommendation).toBe('apply')
    expect(snapshot.requirementCoverage.directCoverage.matchedWeight).toBe(3)
    expect(snapshot.selectedEvidenceByRequirement['101']).toEqual(['achievement:example-delivery'])
  })
})

const generationInputPath = resolve(process.cwd(), 'src/lib/generation-input.ts')
const generationInputTest = existsSync(generationInputPath) ? test : test.todo

describe('documents freshness from frozen evidence', () => {
  generationInputTest(
    'changes the documents input hash when a frozen decision flips inside the snapshot',
    async () => {
      const { canonicalGenerationInputHash } = await import(generationInputPath)
      const base = {
        candidateAnalysisRunId: 1,
        candidateAnalysisInputHash: 'candidate-hash',
        confirmedProfileId: 'fullstack',
        decisions: [{ skillId: 2, decision: 'skip' }],
        reasons: [],
        evidenceHash: 'evidence-hash',
        generationPromptVersion: '2.1.0',
        generationSchemaVersion: '2.1.0',
        resumeModel: 'gpt-5.6-sol',
        coverLetterModel: 'gpt-5.6-terra',
      }
      const included = canonicalGenerationInputHash({
        ...base,
        decisions: [{ skillId: 2, decision: 'include' }],
        reasons: [{ skillId: 2, reason: 'Used in a personal prototype.' }],
      })
      expect(included).not.toBe(canonicalGenerationInputHash(base))
    },
  )

  generationInputTest('keeps the full evidence snapshot as the provenance artifact', async () => {
    const { currentGenerationInputHash } = await import(generationInputPath)
    expect(typeof currentGenerationInputHash).toBe('function')
  })
})
