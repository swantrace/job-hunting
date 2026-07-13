import { describe, expect, test } from 'bun:test'
import { jobParserPromptVersion, jobParserSystemPrompt } from '../src/ai/prompts/job-parser'
import { parsedJobSchema } from '../src/lib/ai'

describe('AI job parser output', () => {
  test('accepts a complete structured result', () => {
    const result = parsedJobSchema.parse({
      jobTitle: 'Backend Engineer',
      companyName: 'Example Co',
      location: null,
      url: null,
      postedDate: null,
      priority: 'B',
      tags: ['backend', 'remote'],
      applicationSource: 'LinkedIn',
      salary: null,
      notes: null,
    })
    expect(result.jobTitle).toBe('Backend Engineer')
  })

  test('keeps a versioned, field-specific prompt contract', () => {
    expect(jobParserPromptVersion).toBe('1.1.0')
    expect(jobParserSystemPrompt).toContain('companyName')
    expect(jobParserSystemPrompt).toContain('postedDate')
  })
})
