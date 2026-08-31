import { describe, expect, test } from 'bun:test'
import type { ApplicationAnalysisRun } from '../../src/db/analysis'
import {
  buildResumeStrategyDraftFromRun,
  resumeStrategyContentSchema,
  runEvidenceAllowlist,
} from '../../src/db/resume-strategy'
import { loadExampleCareerData } from '../support/career-data'

function resultJson(assessments: Array<{ jobRequirementId: number; evidenceStatus: string }>) {
  return JSON.stringify({
    fitRecommendation: 'apply',
    recommendationRationale: 'Synthetic.',
    profileRecommendation: {
      recommendedProfileId: 'fullstack',
      rationale: 'Synthetic.',
      alternatives: [],
    },
    requirementAssessments: assessments.map((assessment) => ({
      jobRequirementId: assessment.jobRequirementId,
      evidenceStatus: assessment.evidenceStatus,
      evidenceRefs:
        assessment.evidenceStatus === 'direct' || assessment.evidenceStatus === 'transferable'
          ? [{ sourceType: 'skill', sourceId: 'typescript', relevance: 'direct' }]
          : [],
      explanation: 'Synthetic.',
      confidence: 0.8,
    })),
    strengths: [],
    concerns: [],
    interviewPreparation: [],
    careerDataSuggestions: [],
  })
}

function completedRun(overrides: Partial<ApplicationAnalysisRun> = {}): ApplicationAnalysisRun {
  return {
    id: 1,
    jobPostingAnalysisId: 1,
    status: 'Completed',
    queueJobId: 'analysis-1',
    attempts: 0,
    inputHash: 'hash',
    inputSnapshotJson: null,
    resultJson: resultJson([{ jobRequirementId: 41, evidenceStatus: 'direct' }]),
    model: null,
    promptVersion: '1.1.0',
    schemaVersion: '1.1.0',
    errorMessage: null,
    recommendedProfileId: 'fullstack',
    confirmedProfileId: 'fullstack',
    profileConfirmedAt: '2026-01-01',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    startedAt: null,
    completedAt: '2026-01-01',
    ...overrides,
  }
}

describe('resume strategy content validation', () => {
  test('accepts a valid strategy with bounded themes and non-overlapping lists', () => {
    const result = resumeStrategyContentSchema.safeParse({
      positioning: 'Backend-leaning full-stack developer',
      primaryThemes: ['Distributed systems', 'API design'],
      emphasizeEvidenceIds: ['skill:typescript'],
      deemphasizeEvidenceIds: ['skill:fhir'],
    })

    expect(result.success).toBe(true)
  })

  test('rejects empty positioning and more than three themes', () => {
    expect(
      resumeStrategyContentSchema.safeParse({
        positioning: '',
        primaryThemes: ['a'],
        emphasizeEvidenceIds: [],
        deemphasizeEvidenceIds: [],
      }).success,
    ).toBe(false)
    expect(
      resumeStrategyContentSchema.safeParse({
        positioning: 'ok',
        primaryThemes: ['a', 'b', 'c', 'd'],
        emphasizeEvidenceIds: [],
        deemphasizeEvidenceIds: [],
      }).success,
    ).toBe(false)
  })

  test('rejects duplicate and overlapping evidence IDs', () => {
    expect(
      resumeStrategyContentSchema.safeParse({
        positioning: 'ok',
        primaryThemes: ['a'],
        emphasizeEvidenceIds: ['skill:typescript', 'skill:typescript'],
        deemphasizeEvidenceIds: [],
      }).success,
    ).toBe(false)
    expect(
      resumeStrategyContentSchema.safeParse({
        positioning: 'ok',
        primaryThemes: ['a'],
        emphasizeEvidenceIds: ['skill:typescript'],
        deemphasizeEvidenceIds: ['skill:typescript'],
      }).success,
    ).toBe(false)
  })
})

describe('resume strategy evidence allowlist and draft', () => {
  test('extracts only direct and transferable evidence IDs as the allowlist', () => {
    const run = completedRun({
      resultJson: resultJson([
        { jobRequirementId: 1, evidenceStatus: 'direct' },
        { jobRequirementId: 2, evidenceStatus: 'transferable' },
        { jobRequirementId: 3, evidenceStatus: 'unknown-evidence' },
      ]),
    })

    expect(runEvidenceAllowlist(run)).toEqual(new Set(['skill:typescript']))
  })

  test('builds a deterministic draft from the confirmed profile and evidence', () => {
    const run = completedRun()
    const data = loadExampleCareerData()
    const draft = buildResumeStrategyDraftFromRun(run, data)

    expect(draft).not.toBeNull()
    expect(draft?.positioning).toBe('Full-Stack Developer')
    expect(draft?.primaryThemes).toEqual(['TypeScript'])
    expect(draft?.emphasizeEvidenceIds).toEqual(['skill:typescript'])
    expect(draft?.deemphasizeEvidenceIds).toEqual([])
  })

  test('returns null for an unconfirmed run', () => {
    const data = loadExampleCareerData()
    expect(
      buildResumeStrategyDraftFromRun(completedRun({ confirmedProfileId: null }), data),
    ).toBeNull()
  })
})
