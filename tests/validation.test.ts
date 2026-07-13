import { describe, expect, test } from 'bun:test'
import { filterSchema, quickCollectSchema } from '../src/lib/validation'

describe('request validation', () => {
  test('accepts a valid quick collect payload', () => {
    const result = quickCollectSchema.safeParse({
      jobTitle: 'Engineer',
      companyName: 'Acme',
      postedDate: '2026-07-12',
      priority: 'B',
    })
    expect(result.success).toBe(true)
  })

  test('rejects invalid dates and URLs', () => {
    const result = quickCollectSchema.safeParse({
      jobTitle: 'Engineer',
      companyName: 'Acme',
      postedDate: 'yesterday',
      url: 'not-a-url',
      priority: 'B',
    })
    expect(result.success).toBe(false)
  })

  test('allowlists sort and filter values', () => {
    const result = filterSchema.parse({ sort: 'drop table jobs', priority: 'Z', view: 'secret' })
    expect(result).toEqual({ q: '', priority: '', view: 'active', today: '', sort: 'updated_desc' })
  })
})
