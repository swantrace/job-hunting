import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const schemaPath = resolve(process.cwd(), 'src/ai/schemas/candidate-fit.ts')
const promptPath = resolve(process.cwd(), 'src/ai/prompts/candidate-fit.ts')
const validationPath = resolve(process.cwd(), 'src/lib/fit-analysis.ts')
const contractTest =
  existsSync(schemaPath) && existsSync(promptPath) && existsSync(validationPath) ? test : test.todo

function validFitAnalysis() {
  return {
    fitRecommendation: 'apply',
    recommendationRationale:
      'The core stack and product-engineering responsibilities have direct evidence.',
    requirementAssessments: [
      {
        jobRequirementId: 101,
        evidenceStatus: 'direct',
        evidenceRefs: [
          {
            sourceType: 'achievement',
            sourceId: 'midato-vite-ci',
            relevance: 'direct',
          },
        ],
        explanation: 'The achievement directly demonstrates engineering improvement.',
        confidence: 0.96,
      },
      {
        jobRequirementId: 102,
        evidenceStatus: 'unknown-evidence',
        evidenceRefs: [],
        explanation: 'No verified mentoring evidence is available.',
        confidence: 0.91,
      },
    ],
    strengths: ['React, TypeScript, and Node.js evidence aligns with the core stack.'],
    concerns: ['Formal mentoring is not established in canonical career data.'],
    interviewPreparation: ['Prepare a verified production-troubleshooting example.'],
    careerDataSuggestions: [
      {
        jobRequirementId: 102,
        suggestion: 'Add a mentoring story later if a verifiable example exists.',
      },
    ],
  }
}

describe('candidate fit and evidence-matrix contract', () => {
  contractTest('accepts explainable recommendations without an opaque overall score', async () => {
    const { candidateFitSchema } = await import(schemaPath)
    const result = candidateFitSchema.parse(validFitAnalysis())

    expect(result.fitRecommendation).toBe('apply')
    expect(result.requirementAssessments).toHaveLength(2)
    expect(result).not.toHaveProperty('overallFitScore')
  })

  contractTest('requires evidence for direct or transferable assessments', async () => {
    const { candidateFitSchema } = await import(schemaPath)
    const invalid = validFitAnalysis()
    invalid.requirementAssessments[0].evidenceRefs = []

    expect(candidateFitSchema.safeParse(invalid).success).toBe(false)
  })

  contractTest('forbids evidence references on an unknown-evidence assessment', async () => {
    const { candidateFitSchema } = await import(schemaPath)
    const invalid = validFitAnalysis()
    invalid.requirementAssessments[1].evidenceRefs = [
      { sourceType: 'story', sourceId: 'invented-story', relevance: 'direct' },
    ]

    expect(candidateFitSchema.safeParse(invalid).success).toBe(false)
  })

  contractTest('rejects the legacy missing status on new output', async () => {
    const { candidateFitSchema } = await import(schemaPath)
    const invalid = validFitAnalysis() as unknown as {
      requirementAssessments: Array<{ evidenceStatus: string }>
    }
    invalid.requirementAssessments[1].evidenceStatus = 'missing'

    expect(candidateFitSchema.safeParse(invalid).success).toBe(false)
  })

  contractTest('normalizes legacy missing to unknown-evidence at the read boundary', async () => {
    const { parseStoredCandidateFit } = await import(
      resolve(process.cwd(), 'src/lib/candidate-fit-result.ts')
    )
    const legacy = JSON.parse(JSON.stringify(validFitAnalysis())) as {
      requirementAssessments: Array<{ evidenceStatus: string }>
    }
    legacy.requirementAssessments[1].evidenceStatus = 'missing'

    const parsed = parseStoredCandidateFit(JSON.stringify(legacy))
    expect(parsed?.requirementAssessments[1].evidenceStatus).toBe('unknown-evidence')
  })

  contractTest('rejects unknown career evidence IDs at the service boundary', async () => {
    const { validateCandidateFitEvidence } = await import(validationPath)
    const result = validFitAnalysis()
    result.requirementAssessments[0].evidenceRefs[0].sourceId = 'invented-metric'

    expect(() =>
      validateCandidateFitEvidence(result, {
        evidence: {
          achievement: new Set(['midato-vite-ci']),
          experience: new Set<string>(),
          project: new Set<string>(),
          publication: new Set<string>(),
          skill: new Set<string>(),
          story: new Set<string>(),
        },
      }),
    ).toThrow()
  })

  contractTest(
    'uses canonical career data rather than a static resume as its factual source',
    async () => {
      const { candidateFitSystemPrompt } = await import(promptPath)
      const prompt = candidateFitSystemPrompt.toLowerCase()

      expect(prompt).toMatch(/canonical career|evidence snapshot/)
      expect(prompt).toMatch(/never invent|do not invent/)
      expect(prompt).toMatch(/apply, apply-selectively, or skip/)
    },
  )
})
