import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import {
  applicationSchema,
  filterSchema,
  managedSkillSchema,
  quickCollectSchema,
} from '../src/lib/validation'
import { type CareerTestDatabase, careerTestDatabase } from './support/career-db'

// Directions and skill categories are database-owned, so payload validation is
// exercised against a seeded career database.
let database: CareerTestDatabase

beforeAll(() => {
  database = careerTestDatabase()
})

afterAll(() => {
  database.cleanup()
})

describe('request validation', () => {
  test('accepts 500-character compensation text in both application forms, but rejects 501', () => {
    const payload = {
      jobTitle: 'Engineer',
      companyName: 'Acme',
      direction: 'fullstack',
      postedDate: '2026-07-12',
      appliedDate: null,
      priority: 'B',
    }
    for (const schema of [quickCollectSchema, applicationSchema]) {
      expect(schema.parse({ ...payload, salary: 'x'.repeat(500) }).salary).toBe('x'.repeat(500))
      expect(schema.safeParse({ ...payload, salary: 'x'.repeat(501) }).success).toBe(false)
      expect(schema.parse({ ...payload, salary: '' }).salary).toBeNull()
    }
  })
  test('accepts a valid quick collect payload', () => {
    const result = quickCollectSchema.safeParse({
      jobTitle: 'Engineer',
      companyName: 'Acme',
      direction: 'fullstack',
      postedDate: '2026-07-12',
      salary: '$100k',
      applicationSource: 'LinkedIn',
    })
    expect(result.success).toBe(true)
  })

  test('rejects invalid dates and URLs', () => {
    const result = quickCollectSchema.safeParse({
      jobTitle: 'Engineer',
      companyName: 'Acme',
      direction: 'fullstack',
      postedDate: 'yesterday',
      url: 'not-a-url',
    })
    expect(result.success).toBe(false)
  })

  test('requires a direction backed by a profile file', () => {
    const result = quickCollectSchema.safeParse({
      jobTitle: 'Engineer',
      companyName: 'Acme',
      direction: 'invented-direction',
      postedDate: '2026-07-12',
    })
    expect(result.success).toBe(false)
  })

  test('allowlists sort and filter values', () => {
    const result = filterSchema.parse({ sort: 'drop table jobs', priority: 'Z', view: 'secret' })
    expect(result).toEqual({
      q: '',
      priority: '',
      statuses: '',
      view: 'list',
      today: '',
      attributes: '',
      sort: 'updated_desc',
    })
  })

  test('allows editable skills to use only configured categories and valid review states', () => {
    expect(
      managedSkillSchema.safeParse({
        name: 'TypeScript',
        category: 'languages-web',
        reviewStatus: 'approved',
      }).success,
    ).toBe(true)
    expect(
      managedSkillSchema.safeParse({
        name: 'TypeScript',
        category: 'unknown',
        reviewStatus: 'approved',
      }).success,
    ).toBe(false)
  })
})
