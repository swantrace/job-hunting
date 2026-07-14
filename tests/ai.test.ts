import { describe, expect, test } from 'bun:test'
import { jobParserPromptVersion, jobParserSystemPrompt } from '../src/ai/prompts/job-parser'
import { parsedJobSchema } from '../src/lib/ai'

describe('AI job parser output', () => {
  test('accepts a complete structured result', () => {
    const result = parsedJobSchema.parse({
      jobTitle: 'Backend Engineer',
      location: null,
      postedDate: null,
      skills: ['backend', 'remote'],
      salary: null,
      requirements: ['TypeScript experience'],
      responsibilities: ['Build APIs'],
      painPoints: [],
      culture: [],
      redFlags: [],
      successMetrics: [],
      benefits: [],
      notes: null,
    })
    expect(result.jobTitle).toBe('Backend Engineer')
  })

  test('keeps a versioned, field-specific prompt contract', () => {
    expect(jobParserPromptVersion).toBe('2.0.0')
    expect(jobParserSystemPrompt).toContain('Do not infer or return a company')
    expect(jobParserSystemPrompt).toContain('postedDate')
  })
})
