import { describe, expect, test } from 'bun:test'
import { jobParserPromptVersion, jobParserSystemPrompt } from '../src/ai/prompts/job-parser'
import { skillReferenceSchema } from '../src/ai/schemas/job-analysis'
import { jobParserResponseSchema } from '../src/ai/schemas/job-parser'
import { parsedJobSchema } from '../src/lib/ai'

describe('AI job parser output', () => {
  test('accepts a complete structured result with requirement-owned skills', () => {
    const result = parsedJobSchema.parse({
      jobTitle: 'Backend Engineer',
      location: null,
      postedDate: null,
      salary: null,
      direction: 'fullstack',
    })
    expect(result.jobTitle).toBe('Backend Engineer')
    expect(result.direction).toBe('fullstack')
  })

  test('keeps a versioned, field-specific prompt contract', () => {
    expect(jobParserPromptVersion).toMatch(/^\d+\.\d+\.\d+$/)
    expect(jobParserSystemPrompt).toContain('Do not infer or return a company')
    expect(jobParserSystemPrompt).toContain('job URL')
    expect(jobParserSystemPrompt).toContain('application source')
    expect(jobParserSystemPrompt).toContain('postedDate')
    // The parser no longer publishes a parallel top-level skills list, and the
    // direction field is constrained to the supplied direction ids.
    const parserSchema = jobParserResponseSchema(['fullstack', 'frontend'])
    expect(parserSchema.properties).not.toHaveProperty('skills')
    expect(parserSchema.properties.direction.enum).toEqual(['fullstack', 'frontend'])
  })

  test('rejects malformed skill confidence and source excerpts', () => {
    const valid = skillReferenceSchema.safeParse({
      rawLabel: 'Kafka',
      canonicalLabel: 'Kafka',
      category: 'messaging-async',
      confidence: 0.96,
    })
    expect(valid.success).toBe(true)

    expect(
      skillReferenceSchema.safeParse({
        rawLabel: 'Kafka',
        canonicalLabel: 'Kafka',
        category: 'messaging-async',
        confidence: 1.2,
      }).success,
    ).toBe(false)

    expect(
      skillReferenceSchema.safeParse({
        rawLabel: 'Kafka',
        canonicalLabel: 'Kafka',
        category: 'miscellaneous',
        confidence: 0.96,
      }).success,
    ).toBe(false)
  })
})
