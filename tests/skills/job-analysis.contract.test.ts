import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { jobParserPromptVersion, jobParserSystemPrompt } from '../../src/ai/prompts/job-parser'
import { jobParserResponseSchema, parsedJobSchema } from '../../src/ai/schemas/job-parser'

type JsonSchemaRecord = {
  properties?: Record<string, unknown>
  required?: string[]
  type?: string
}

const skillItems = jobParserResponseSchema.properties.skills.items as JsonSchemaRecord
const structuredSkillsImplemented = skillItems.type === 'object'
const structuredSkillTest = structuredSkillsImplemented ? test : test.todo

function parsedJob(skills: unknown[]) {
  return {
    benefits: [],
    culture: [],
    jobTitle: 'Platform Engineer',
    location: null,
    notes: null,
    painPoints: [],
    postedDate: null,
    redFlags: [],
    requirements: ['Experience building event-driven systems with Kafka'],
    responsibilities: ['Build reliable asynchronous services'],
    salary: null,
    skills,
    successMetrics: [],
  }
}

describe('planned structured JD skill analysis contract', () => {
  structuredSkillTest('accepts a source-grounded canonical skill requirement', () => {
    const result = parsedJobSchema.parse(
      parsedJob([
        {
          canonicalLabel: 'Kafka',
          category: 'messaging-async',
          confidence: 0.96,
          importance: 'required',
          rawLabel: 'Apache Kafka',
          sourceText: 'Experience building event-driven systems with Kafka',
        },
      ]),
    )

    expect(result.skills).toHaveLength(1)
    expect(result.skills[0]).toEqual(
      expect.objectContaining({ canonicalLabel: 'Kafka', importance: 'required' }),
    )
  })

  structuredSkillTest('rejects uncontrolled categories and importance values', () => {
    const invalidCategory = parsedJobSchema.safeParse(
      parsedJob([
        {
          canonicalLabel: 'Kafka',
          category: 'miscellaneous',
          confidence: 0.9,
          importance: 'required',
          rawLabel: 'Kafka',
          sourceText: 'Kafka experience',
        },
      ]),
    )
    const invalidImportance = parsedJobSchema.safeParse(
      parsedJob([
        {
          canonicalLabel: 'Kafka',
          category: 'messaging-async',
          confidence: 0.9,
          importance: 'critical-ish',
          rawLabel: 'Kafka',
          sourceText: 'Kafka experience',
        },
      ]),
    )

    expect(invalidCategory.success).toBe(false)
    expect(invalidImportance.success).toBe(false)
  })

  structuredSkillTest('publishes every structured field in the provider response schema', () => {
    expect(skillItems.properties).toBeDefined()
    expect(Object.keys(skillItems.properties ?? {}).sort()).toEqual([
      'canonicalLabel',
      'category',
      'confidence',
      'importance',
      'rawLabel',
      'sourceText',
    ])
    expect([...(skillItems.required ?? [])].sort()).toEqual([
      'canonicalLabel',
      'category',
      'confidence',
      'importance',
      'rawLabel',
      'sourceText',
    ])
  })

  structuredSkillTest('instructs the model not to turn work arrangements into skills', () => {
    expect(jobParserPromptVersion).not.toBe('2.1.0')
    expect(jobParserSystemPrompt.toLowerCase()).toMatch(/remote|hybrid/)
    expect(jobParserSystemPrompt.toLowerCase()).toMatch(/not.*skill|exclude/)
  })

  structuredSkillTest('removes the legacy 20-item persistence truncation', () => {
    const queries = readFileSync(resolve(process.cwd(), 'src/db/queries.ts'), 'utf8')
    expect(queries).not.toMatch(/\.slice\(0,\s*20\)/)
    expect(jobParserResponseSchema.properties.skills.maxItems).toBe(30)
  })
})
