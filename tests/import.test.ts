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

  test('previews ambiguous alias and decision conflicts instead of silently merging', () => {
    const conflicts = detectImportConflicts({
      skills: [
        { id: 1, name: 'Node.js', aliases: ['nodejs'] },
        { id: 2, name: 'nodejs', aliases: [] },
      ],
      applicationSkills: [
        { jobApplicationId: 1, skillId: 1, userDecision: 'skip' },
        { jobApplicationId: 1, skillId: 1, userDecision: 'include', decisionReason: 'Reason' },
      ],
    })
    expect(conflicts.some((item) => /nodejs/.test(item))).toBe(true)
    expect(conflicts.some((item) => /Conflicting decisions/.test(item))).toBe(true)
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
})
