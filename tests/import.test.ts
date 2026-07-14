import { describe, expect, test } from 'bun:test'
import { applicationKey, companyKey, contactKey, importPayloadSchema } from '../src/lib/import'

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
})
