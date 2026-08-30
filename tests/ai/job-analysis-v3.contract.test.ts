import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const schemaPath = resolve(process.cwd(), 'src/ai/schemas/job-analysis.ts')
const promptPath = resolve(process.cwd(), 'src/ai/prompts/job-analysis.ts')
const contractTest = existsSync(schemaPath) && existsSync(promptPath) ? test : test.todo

function validAnalysis() {
  return {
    summary: {
      rolePurpose: 'Build and support educational SaaS features across the stack.',
      idealCandidate:
        'A product engineer with React, TypeScript, Node.js, testing, and delivery experience.',
    },
    classification: {
      roleType: 'fullstack',
      advertisedSeniority: 'intermediate',
      practicalSeniority: 'strong-mid',
      rationale: 'The posting combines feature ownership with architecture and mentoring.',
      functionalEmphasis: {
        frontend: 30,
        backend: 30,
        testingQuality: 15,
        devopsInfrastructure: 10,
        collaborationOwnership: 15,
      },
    },
    requirements: [
      {
        type: 'skill',
        importance: 'required',
        basis: 'explicit',
        statement: 'Commercial SaaS experience with Node.js, TypeScript, and React.',
        sourceText:
          'At least 3 years of experience building commercial SaaS applications using Node.js, TypeScript, and React.',
        inferenceRationale: null,
        skillReferences: [
          {
            rawLabel: 'React',
            canonicalLabel: 'React',
            category: 'frontend',
            confidence: 0.95,
          },
        ],
      },
      {
        type: 'responsibility',
        importance: 'required',
        basis: 'inferred',
        statement: 'Operate with strong-mid autonomy.',
        sourceText: 'Develop and deliver software features with minimal supervision.',
        inferenceRationale: 'Minimal supervision indicates meaningful independent ownership.',
        skillReferences: [],
      },
    ],
    painPoints: [],
    culture: [],
    redFlags: [],
    successMetrics: [],
    benefits: [],
    notes: null,
    interviewQuestions: [
      'What does production support or on-call responsibility look like for this team?',
    ],
  }
}

describe('job-only analysis v3 contract', () => {
  contractTest(
    'accepts structured role classification and source-grounded requirements',
    async () => {
      const { jobAnalysisSchema } = await import(schemaPath)
      const result = jobAnalysisSchema.parse(validAnalysis())

      expect(result.classification.roleType).toBe('fullstack')
      expect(result.requirements[0].sourceText).toContain('Node.js')
    },
  )

  contractTest('requires functional emphasis to total exactly 100 percent', async () => {
    const { jobAnalysisSchema } = await import(schemaPath)
    const invalid = validAnalysis()
    invalid.classification.functionalEmphasis.frontend = 31

    expect(jobAnalysisSchema.safeParse(invalid).success).toBe(false)
  })

  contractTest(
    'rejects unsupported requirement classifications and candidate-fit fields',
    async () => {
      const { jobAnalysisSchema } = await import(schemaPath)
      const invalidType = validAnalysis()
      invalidType.requirements[0].type = 'miscellaneous'

      expect(jobAnalysisSchema.safeParse(invalidType).success).toBe(false)
      expect(
        jobAnalysisSchema.safeParse({
          ...validAnalysis(),
          overallFitScore: 8.9,
          recommendedProfileId: 'fullstack',
        }).success,
      ).toBe(false)
    },
  )

  contractTest('requires an explanation for inferred requirements', async () => {
    const { jobAnalysisSchema } = await import(schemaPath)
    const invalid = validAnalysis()
    invalid.requirements[1].inferenceRationale = null

    expect(jobAnalysisSchema.safeParse(invalid).success).toBe(false)
  })

  contractTest(
    'keeps candidate facts and resume selection outside the job-analysis prompt',
    async () => {
      const { jobAnalysisSystemPrompt } = await import(promptPath)
      const prompt = jobAnalysisSystemPrompt.toLowerCase()

      expect(prompt).toMatch(/job posting|job description/)
      expect(prompt).toMatch(/do not.*candidate|do not.*resume|job-only/)
      expect(prompt).toMatch(/explicit.*inferred|inferred.*explicit/)
    },
  )
})
