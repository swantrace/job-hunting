import { describe, expect, test } from 'bun:test'
import { jobParserPromptVersion, jobParserSystemPrompt } from '../src/ai/prompts/job-parser'
import { jobParserResponseSchema, skillRequirementItemSchema } from '../src/ai/schemas/job-parser'
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

  test('rejects malformed skill confidence and source excerpts', () => {
    const valid = skillRequirementItemSchema.safeParse({
      rawLabel: 'Kafka',
      canonicalLabel: 'Kafka',
      category: 'messaging-async',
      importance: 'required',
      sourceText: 'Kafka experience',
      confidence: 0.96,
    })
    expect(valid.success).toBe(true)

    expect(
      skillRequirementItemSchema.safeParse({
        rawLabel: 'Kafka',
        canonicalLabel: 'Kafka',
        category: 'messaging-async',
        importance: 'required',
        sourceText: 'Kafka experience',
        confidence: 1.2,
      }).success,
    ).toBe(false)

    expect(
      skillRequirementItemSchema.safeParse({
        rawLabel: 'Kafka',
        canonicalLabel: 'Kafka',
        category: 'messaging-async',
        importance: 'required',
        sourceText: '',
        confidence: 0.96,
      }).success,
    ).toBe(false)
  })
})
