import { describe, expect, test } from 'bun:test'
import { jobParserPromptVersion, jobParserSystemPrompt } from '../src/ai/prompts/job-parser'
import { jobParserResponseSchema } from '../src/ai/schemas/job-parser'
import { parsedJobSchema } from '../src/lib/ai'

describe('AI job parser output', () => {
  test('accepts a complete structured result', () => {
    const skillItems = jobParserResponseSchema.properties.skills.items as { type?: string }
    const skills =
      skillItems.type === 'object'
        ? [
            {
              canonicalLabel: 'TypeScript',
              category: 'languages-web',
              confidence: 0.98,
              importance: 'required',
              rawLabel: 'TypeScript',
              sourceText: 'Professional TypeScript experience',
            },
          ]
        : ['typescript']
    const result = parsedJobSchema.parse({
      jobTitle: 'Backend Engineer',
      location: null,
      postedDate: null,
      skills,
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
    expect(jobParserPromptVersion).toMatch(/^\d+\.\d+\.\d+$/)
    expect(jobParserSystemPrompt).toContain('Do not infer or return a company')
    expect(jobParserSystemPrompt).toContain('job URL')
    expect(jobParserSystemPrompt).toContain('application source')
    expect(jobParserSystemPrompt).toContain('postedDate')
    expect(jobParserResponseSchema.properties.skills.maxItems).toBe(30)
  })
})
