import { describe, expect, test } from 'bun:test'
import {
  applicationKey,
  companyKey,
  contactKey,
  detectImportConflicts,
  importPayloadSchema,
} from '../src/lib/import'

describe('JSON import format', () => {
  test('uses stable case-insensitive matching keys', () => {
    expect(companyKey({ name: 'Acme' })).toBe(companyKey({ name: ' acme ' }))
    expect(contactKey({ name: 'Alex', email: 'ALEX@example.com' }, 'Acme')).toBe(
      contactKey({ name: 'Other', email: 'alex@example.com' }, 'acme'),
    )
    expect(applicationKey({ jobTitle: 'Engineer', url: 'https://example.com/job' }, 'Acme')).toBe(
      applicationKey({ jobTitle: 'Engineer', url: 'https://example.com/job' }, 'acme'),
    )
  })

  test('accepts a versioned export payload with optional collections', () => {
    const parsed = importPayloadSchema.parse({ schemaVersion: 1 })
    expect(parsed.schemaVersion).toBe(1)
    expect(parsed.applications).toEqual([])
    expect(parsed.skills).toEqual([])
  })

  test('normalizes legacy tag exports into skills', () => {
    const parsed = importPayloadSchema.parse({
      schemaVersion: 1,
      tags: [{ id: 1, name: 'TypeScript' }],
      applicationTags: [{ jobApplicationId: 4, tagId: 1, tagName: 'TypeScript' }],
    })
    expect(parsed.skills).toEqual([{ id: 1, name: 'TypeScript' }])
    expect(parsed.applicationSkills[0]?.skillName).toBe('TypeScript')
  })

  test('round-trips aliases, taxonomy review state, requirements, and user decisions', () => {
    const parsed = importPayloadSchema.parse({
      schemaVersion: 1,
      skills: [
        {
          id: 1,
          name: 'Kafka',
          key: 'kafka',
          category: 'messaging-async',
          reviewStatus: 'approved',
          origin: 'career-data',
          careerSkillId: 'kafka',
        },
      ],
      skillAliases: [{ skillId: 1, alias: 'Apache Kafka', normalizedAlias: 'apache kafka' }],
      applicationSkills: [
        {
          jobApplicationId: 1,
          skillId: 1,
          rawLabel: 'Kafka',
          importance: 'required',
          analysisResult: 'not-in-career-data',
          userDecision: 'include',
          decisionReason: 'Used in a personal prototype.',
        },
      ],
    })
    expect(parsed.skills[0]).toMatchObject({ key: 'kafka', careerSkillId: 'kafka' })
    expect(parsed.skillAliases).toHaveLength(1)
    expect(parsed.applicationSkills[0]).toMatchObject({
      userDecision: 'include',
      decisionReason: 'Used in a personal prototype.',
    })
  })

  test('previews ambiguous alias conflicts instead of silently merging', () => {
    const conflicts = detectImportConflicts({
      skills: [
        { id: 1, name: 'Node.js', aliases: ['nodejs'] },
        { id: 2, name: 'nodejs', aliases: [] },
      ],
    })
    expect(conflicts.some((item) => /nodejs/.test(item))).toBe(true)
  })

  test('imports schema version 1 backups after the taxonomy export version is introduced', () => {
    const parsed = importPayloadSchema.parse({
      schemaVersion: 1,
      skills: [{ id: 1, name: 'Kafka' }],
      applicationSkills: [{ jobApplicationId: 1, skillId: 1, skillName: 'Kafka' }],
    })
    expect(parsed.skills).toEqual([{ id: 1, name: 'Kafka' }])
    expect(parsed.applicationSkills[0]).toMatchObject({ skillName: 'Kafka' })
    expect(parsed.skillAliases).toEqual([])
  })

  test('accepts legacy line-based job analyses before structured analysis fields exist', () => {
    const parsed = importPayloadSchema.parse({
      schemaVersion: 1,
      jobPostingAnalyses: [
        {
          jobApplicationId: 1,
          requirements: 'Node.js experience\nTypeScript experience',
          responsibilities: 'Build production APIs',
          model: 'gpt-5-mini',
          promptVersion: '2.2.0',
        },
      ],
    })
    expect(parsed.jobPostingAnalyses[0]).toMatchObject({
      requirements: 'Node.js experience\nTypeScript experience',
      promptVersion: '2.2.0',
    })
  })

  test('accepts version 2 payloads with analysis and generation provenance collections', () => {
    const parsed = importPayloadSchema.parse({
      schemaVersion: 2,
      jobRequirements: [
        {
          jobPostingAnalysisId: 1,
          sequence: 1,
          requirementType: 'skill',
          importance: 'required',
          basis: 'explicit',
          statement: 'TypeScript',
        },
      ],
      jobRequirementsToSkills: [{ jobRequirementId: 1, skillId: 1 }],
      applicationAnalysisRuns: [
        {
          id: 1,
          jobApplicationId: 1,
          status: 'Completed',
          queueJobId: 'analysis-1',
          resultJson: '{}',
        },
      ],
      generationRuns: [
        { id: 1, jobApplicationId: 1, status: 'Completed', queueJobId: 'generation-1' },
      ],
      generationRunResults: [
        { generationRunId: 1, resumeJson: null, coverLetterJson: null, atsAuditJson: null },
      ],
      documentReviews: [{ id: 1, generationRunId: 1, status: 'Completed', queueJobId: 'review-1' }],
    })
    expect(parsed.jobRequirements).toHaveLength(1)
    expect(parsed.applicationAnalysisRuns).toHaveLength(1)
    expect(parsed.generationRunResults).toHaveLength(1)
    expect(parsed.documentReviews).toHaveLength(1)
  })

  test('accepts version 3 payloads with run-scoped decisions and generation identity', () => {
    const parsed = importPayloadSchema.parse({
      schemaVersion: 3,
      jobPostingAnalyses: [
        {
          id: 10,
          jobApplicationId: 1,
          status: 'Completed',
          queueJobId: 'job-analysis-10',
          inputHash: 'job-input-hash',
          frozenInputJson: '{"version":1}',
          schemaVersion: '3.0.0',
        },
      ],
      applicationAnalysisRuns: [
        { id: 5, jobApplicationId: 1, status: 'Completed', queueJobId: 'analysis-5' },
      ],
      analysisRunDecisions: [
        { id: 1, applicationAnalysisRunId: 5, skillId: 1, decision: 'skip', reason: null },
      ],
      generationRuns: [
        {
          id: 2,
          jobApplicationId: 1,
          status: 'Completed',
          queueJobId: 'generation-2',
          inputHash: 'generation-input-hash',
          frozenInputJson: '{"version":1}',
          resumeModel: 'gpt-5.6-sol',
          coverLetterModel: 'gpt-5.6-terra',
          promptVersion: '2.1.0',
          schemaVersion: '2.1.0',
        },
      ],
    })
    expect(parsed.schemaVersion).toBe(3)
    expect(parsed.jobPostingAnalyses[0]).toMatchObject({
      status: 'Completed',
      inputHash: 'job-input-hash',
    })
    expect(parsed.analysisRunDecisions).toHaveLength(1)
    expect(parsed.generationRuns[0]).toMatchObject({
      inputHash: 'generation-input-hash',
      resumeModel: 'gpt-5.6-sol',
    })
  })

  test('defaults versioned collections for old backups', () => {
    const parsed = importPayloadSchema.parse({ schemaVersion: 1 })
    expect(parsed.analysisRunDecisions).toEqual([])
  })
})
