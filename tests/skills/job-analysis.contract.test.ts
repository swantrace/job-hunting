import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  jobAnalysisCatalogBlock,
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
const requirementProperties = requirementItems.properties ?? {}
const termItems = (requirementProperties.terms as JsonSchemaRecord).items as JsonSchemaRecord

function analysis(terms: unknown[]) {
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
        terms,
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

describe('catalog-grounded JD skill term contract', () => {
  test('accepts a source-grounded requirement-owned raw term', () => {
    const result = jobAnalysisSchema.parse(
      analysis([
        {
          term: 'Apache Kafka',
          sourceText: 'Experience building event-driven systems with Kafka',
          confidence: 0.96,
          key: 'kafka',
        },
      ]),
    )

    expect(result.requirements[0].terms).toHaveLength(1)
    expect(result.requirements[0].terms[0]).toEqual({
      term: 'Apache Kafka',
      sourceText: 'Experience building event-driven systems with Kafka',
      confidence: 0.96,
      key: 'kafka',
    })
  })

  test('rejects a blank term, an out-of-range confidence and duplicate terms', () => {
    expect(
      jobAnalysisSchema.safeParse(analysis([{ term: '   ', sourceText: null, confidence: null }]))
        .success,
    ).toBe(false)
    expect(
      jobAnalysisSchema.safeParse(analysis([{ term: 'Kafka', confidence: 1.2 }])).success,
    ).toBe(false)
    expect(
      jobAnalysisSchema.safeParse(analysis([{ term: 'Kafka' }, { term: 'kafka' }])).success,
    ).toBe(false)
  })

  test('rejects the removed canonical-label skill reference shape', () => {
    const result = jobAnalysisSchema.safeParse(
      analysis([
        {
          rawLabel: 'Apache Kafka',
          canonicalLabel: 'Kafka',
          category: 'messaging-async',
          confidence: 0.96,
        },
      ]),
    )
    expect(result.success).toBe(false)
  })

  test('publishes every structured term field in the provider response schema', () => {
    expect(termItems.properties).toBeDefined()
    expect(Object.keys(termItems.properties ?? {}).sort()).toEqual([
      'confidence',
      'key',
      'sourceText',
      'term',
    ])
    expect([...(termItems.required ?? [])].sort()).toEqual([
      'confidence',
      'key',
      'sourceText',
      'term',
    ])
    // The model can no longer propose a canonical label or a taxonomy category.
    expect(requirementProperties).not.toHaveProperty('skillReferences')
    expect(termItems.properties).not.toHaveProperty('canonicalLabel')
    expect(termItems.properties).not.toHaveProperty('category')
  })

  test('instructs the model never to invent a catalog entry or turn work arrangements into skills', () => {
    expect(jobAnalysisPromptVersion).toBe('5.1.0')
    expect(jobAnalysisSystemPrompt.toLowerCase()).toMatch(/remote|hybrid/)
    expect(jobAnalysisSystemPrompt.toLowerCase()).toMatch(/not.*skill|exclude/)
    expect(jobAnalysisSystemPrompt).toMatch(/never invent a catalog entry|catalog snapshot/)
    expect(jobAnalysisSystemPrompt).toMatch(/raw term|raw/)
  })

  test('renders exactly the bounded supplied catalog entries into the prompt block', () => {
    const block = jobAnalysisCatalogBlock([
      { key: 'react', name: 'React', category: 'frontend', aliases: ['React.js'] },
      { key: 'sqlite', name: 'SQLite', category: null, aliases: [] },
    ])
    expect(block).toContain('- key: react | name: React | category: frontend | aliases: React.js')
    expect(block).toContain(
      '- key: sqlite | name: SQLite | category: uncategorised | aliases: none',
    )
    // Only the supplied entries are rendered: nothing else from any catalog.
    expect(block).not.toContain('typescript')
    expect(block).not.toContain('kubernetes')
    expect(jobAnalysisCatalogBlock([])).toContain(
      'Approved catalog entries supplied for this posting: none.',
    )
  })

  test('removes the legacy 20-item persistence truncation', () => {
    const queries = readFileSync(resolve(process.cwd(), 'src/db/queries.ts'), 'utf8')
    expect(queries).not.toMatch(/\.slice\(0,\s*20\)/)
  })
})
