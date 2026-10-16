import { describe, expect, test } from 'bun:test'
import { parsedJobSchema } from '../src/ai/client'
import { jobParserPromptVersion, jobParserSystemPrompt } from '../src/ai/prompts/job-parser'
import { requirementTermSchema } from '../src/ai/schemas/job-analysis'
import { jobParserResponseSchema } from '../src/ai/schemas/job-parser'

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

  test('accepts a raw requirement term and rejects a malformed one', () => {
    // : the parser emits raw terms with source context, never a canonical
    // label or a category. A proposed catalog key stays an optional hint.
    const valid = requirementTermSchema.safeParse({
      term: 'Kafka',
      sourceText: 'Experience with Apache Kafka',
      confidence: 0.96,
      key: 'kafka',
    })
    expect(valid.success).toBe(true)

    expect(requirementTermSchema.safeParse({ term: 'Kafka', confidence: 1.2 }).success).toBe(false)
    expect(requirementTermSchema.safeParse({ term: '  ' }).success).toBe(false)
    // Unknown keys are still rejected: the model cannot smuggle a canonical label.
    expect(
      requirementTermSchema.safeParse({ term: 'Kafka', canonicalLabel: 'Kafka' }).success,
    ).toBe(false)
  })
})
