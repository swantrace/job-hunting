import { z } from 'zod'
import {
  analysisRequirementBases,
  requirementImportances,
  requirementTypes,
} from '../../lib/job-requirements/constants'

/**
 * Candidate-independent structured job analysis. This schema is the single
 * contract for the combined prompts 14 + 15 call: it receives job-posting text
 * only and must never contain candidate fit, profile selection, match scores,
 * or resume/cover-letter output. Unknown keys are rejected so a model cannot
 * smuggle a fabricated fit score back into a stored analysis.
 */

export const roleTypes = [
  'frontend',
  'backend',
  'fullstack',
  'platform-devops',
  'data-ai',
  'mixed',
] as const

export const seniorities = [
  'intern',
  'junior',
  'intermediate',
  'strong-mid',
  'senior',
  'staff-plus',
  'ambiguous',
] as const

const functionalEmphasisSchema = z
  .object({
    frontend: z.number().int().min(0).max(100),
    backend: z.number().int().min(0).max(100),
    testingQuality: z.number().int().min(0).max(100),
    devopsInfrastructure: z.number().int().min(0).max(100),
    collaborationOwnership: z.number().int().min(0).max(100),
  })
  .strict()

const jobRequirementSchema = z
  .object({
    type: z.enum(requirementTypes),
    importance: z.enum(requirementImportances),
    basis: z.enum(analysisRequirementBases),
    statement: z.string().trim().min(1).max(1000),
    sourceText: z.string().trim().min(1).max(2000),
    inferenceRationale: z.string().trim().min(1).max(2000).nullable(),
  })
  .strict()

export const jobAnalysisSchema = z
  .object({
    summary: z
      .object({
        rolePurpose: z.string().trim().min(1).max(2000),
        idealCandidate: z.string().trim().min(1).max(2000),
      })
      .strict(),
    classification: z
      .object({
        roleType: z.enum(roleTypes),
        advertisedSeniority: z.enum(seniorities),
        practicalSeniority: z.enum(seniorities),
        rationale: z.string().trim().min(1).max(2000),
        functionalEmphasis: functionalEmphasisSchema,
      })
      .strict(),
    requirements: z.array(jobRequirementSchema).min(1).max(40),
    interviewQuestions: z.array(z.string().trim().min(1).max(1000)).max(20),
  })
  .strict()
  .superRefine((analysis, ctx) => {
    const emphasis = analysis.classification.functionalEmphasis
    const total =
      emphasis.frontend +
      emphasis.backend +
      emphasis.testingQuality +
      emphasis.devopsInfrastructure +
      emphasis.collaborationOwnership
    if (total !== 100)
      ctx.addIssue({
        code: 'custom',
        message: `Functional emphasis percentages must total exactly 100 (received ${total}).`,
        path: ['classification', 'functionalEmphasis'],
      })

    for (const [index, requirement] of analysis.requirements.entries()) {
      if (requirement.basis === 'inferred' && !requirement.inferenceRationale)
        ctx.addIssue({
          code: 'custom',
          message: 'An inferred requirement requires a concise inference rationale.',
          path: ['requirements', index, 'inferenceRationale'],
        })
      if (requirement.basis === 'explicit' && requirement.inferenceRationale !== null)
        ctx.addIssue({
          code: 'custom',
          message: 'An explicit requirement must not carry an inference rationale.',
          path: ['requirements', index, 'inferenceRationale'],
        })
    }
  })

export type JobAnalysis = z.infer<typeof jobAnalysisSchema>
export type JobAnalysisRequirement = z.infer<typeof jobRequirementSchema>

export const jobAnalysisSchemaVersion = '3.0.0'

const stringSchema = { type: 'string' } as const
const nullableStringSchema = { type: ['string', 'null'] } as const

const requirementJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    type: {
      type: 'string',
      enum: [...requirementTypes],
      description:
        'The kind of requirement: skill, experience, responsibility, education, soft-skill, or domain.',
    },
    importance: {
      type: 'string',
      enum: [...requirementImportances],
      description: 'required, preferred, or merely mentioned.',
    },
    basis: {
      type: 'string',
      enum: [...analysisRequirementBases],
      description: 'explicit when the posting states it directly; inferred when it is derived.',
    },
    statement: {
      type: 'string',
      description: 'A concise, self-contained statement of the requirement.',
    },
    sourceText: {
      type: 'string',
      description: 'A short exact excerpt from the posting that grounds this requirement.',
    },
    inferenceRationale: {
      ...nullableStringSchema,
      description:
        'Required and non-null for inferred requirements; must be null for explicit requirements.',
    },
  },
  required: ['type', 'importance', 'basis', 'statement', 'sourceText', 'inferenceRationale'],
}

export const jobAnalysisResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: {
      type: 'object',
      additionalProperties: false,
      properties: {
        rolePurpose: stringSchema,
        idealCandidate: {
          type: 'string',
          description:
            'The ideal candidate profile described by the posting, never the actual candidate.',
        },
      },
      required: ['rolePurpose', 'idealCandidate'],
    },
    classification: {
      type: 'object',
      additionalProperties: false,
      properties: {
        roleType: { type: 'string', enum: [...roleTypes] },
        advertisedSeniority: { type: 'string', enum: [...seniorities] },
        practicalSeniority: { type: 'string', enum: [...seniorities] },
        rationale: stringSchema,
        functionalEmphasis: {
          type: 'object',
          additionalProperties: false,
          properties: {
            frontend: { type: 'integer', minimum: 0, maximum: 100 },
            backend: { type: 'integer', minimum: 0, maximum: 100 },
            testingQuality: { type: 'integer', minimum: 0, maximum: 100 },
            devopsInfrastructure: { type: 'integer', minimum: 0, maximum: 100 },
            collaborationOwnership: { type: 'integer', minimum: 0, maximum: 100 },
          },
          required: [
            'frontend',
            'backend',
            'testingQuality',
            'devopsInfrastructure',
            'collaborationOwnership',
          ],
          description: 'Integer percentages that must total exactly 100.',
        },
      },
      required: [
        'roleType',
        'advertisedSeniority',
        'practicalSeniority',
        'rationale',
        'functionalEmphasis',
      ],
    },
    requirements: {
      type: 'array',
      items: requirementJsonSchema,
      minItems: 1,
      maxItems: 40,
    },
    interviewQuestions: {
      type: 'array',
      items: stringSchema,
      maxItems: 20,
      description: 'Role-focused interview questions grounded in the posting.',
    },
  },
  required: ['summary', 'classification', 'requirements', 'interviewQuestions'],
} as const
