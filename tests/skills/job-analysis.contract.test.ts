import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  jobAnalysisPromptVersion,
  jobAnalysisSystemPrompt,
} from '../../src/ai/prompts/job-analysis'
import { jobAnalysisResponseSchema, jobAnalysisSchema } from '../../src/ai/schemas/job-analysis'

type JsonSchemaRecord = {
  properties?: Record<string, unknown>
  required?: string[]
  type?: string
  items?: JsonSchemaRecord
}

const requirementItems = (jobAnalysisResponseSchema.properties.requirements as JsonSchemaRecord)
  .items as JsonSchemaRecord
const skillReferenceItems = (
  (requirementItems.properties ?? {}).skillReferences as JsonSchemaRecord
).items as JsonSchemaRecord
const structuredSkillsImplemented = skillReferenceItems.type === 'object'
const structuredSkillTest = structuredSkillsImplemented ? test : test.todo

function analysis(skillReferences: unknown[]) {
  return {
    summary: {
      rolePurpose: 'Build event-driven platform services.',
      idealCandidate: 'An engineer with streaming and delivery experience.',
    },
    classification: {
      roleType: 'backend',
      advertisedSeniority: 'intermediate',
      practicalSeniority: 'strong-mid',
      rationale: 'The posting emphasizes distributed systems ownership.',
      functionalEmphasis: {
        frontend: 0,
        backend: 50,
        testingQuality: 15,
        devopsInfrastructure: 20,
        collaborationOwnership: 15,
      },
    },
    requirements: [
      {
        type: 'skill',
        importance: 'required',
        basis: 'explicit',
        statement: 'Experience building event-driven systems with Kafka.',
        sourceText: 'Experience building event-driven systems with Kafka',
        inferenceRationale: null,
        skillReferences,
      },
    ],
    painPoints: [],
    culture: [],
    redFlags: [],
    successMetrics: [],
    benefits: [],
    notes: null,
    interviewQuestions: [],
  }
}

describe('planned structured JD skill analysis contract', () => {
  structuredSkillTest('accepts a source-grounded requirement-owned skill reference', () => {
    const result = jobAnalysisSchema.parse(
      analysis([
        {
          rawLabel: 'Apache Kafka',
          canonicalLabel: 'Kafka',
          category: 'messaging-async',
          confidence: 0.96,
        },
      ]),
    )

    expect(result.requirements[0].skillReferences).toHaveLength(1)
    expect(result.requirements[0].skillReferences[0]).toEqual(
      expect.objectContaining({ canonicalLabel: 'Kafka', confidence: 0.96 }),
    )
  })

  structuredSkillTest('rejects uncontrolled categories and duplicate references', () => {
    const invalidCategory = jobAnalysisSchema.safeParse(
      analysis([
        { rawLabel: 'Kafka', canonicalLabel: 'Kafka', category: 'miscellaneous', confidence: 0.9 },
      ]),
    )
    const duplicateReference = jobAnalysisSchema.safeParse(
      analysis([
        {
          rawLabel: 'Kafka',
          canonicalLabel: 'Kafka',
          category: 'messaging-async',
          confidence: 0.9,
        },
        {
          rawLabel: 'kafka',
          canonicalLabel: 'Kafka',
          category: 'messaging-async',
          confidence: 0.8,
        },
      ]),
    )
    const invalidConfidence = jobAnalysisSchema.safeParse(
      analysis([
        {
          rawLabel: 'Kafka',
          canonicalLabel: 'Kafka',
          category: 'messaging-async',
          confidence: 1.2,
        },
      ]),
    )

    expect(invalidCategory.success).toBe(false)
    expect(duplicateReference.success).toBe(false)
    expect(invalidConfidence.success).toBe(false)
  })

  structuredSkillTest(
    'publishes every structured skill field in the provider response schema',
    () => {
      expect(skillReferenceItems.properties).toBeDefined()
      expect(Object.keys(skillReferenceItems.properties ?? {}).sort()).toEqual([
        'canonicalLabel',
        'category',
        'confidence',
        'rawLabel',
      ])
      expect([...(skillReferenceItems.required ?? [])].sort()).toEqual([
        'canonicalLabel',
        'category',
        'confidence',
        'rawLabel',
      ])
    },
  )

  structuredSkillTest('instructs the model not to turn work arrangements into skills', () => {
    expect(jobAnalysisPromptVersion).not.toBe('3.0.0')
    expect(jobAnalysisSystemPrompt.toLowerCase()).toMatch(/remote|hybrid/)
    expect(jobAnalysisSystemPrompt.toLowerCase()).toMatch(/not.*skill|exclude/)
  })

  structuredSkillTest('removes the legacy 20-item persistence truncation', () => {
    const queries = readFileSync(resolve(process.cwd(), 'src/db/queries.ts'), 'utf8')
    expect(queries).not.toMatch(/\.slice\(0,\s*20\)/)
  })
})
