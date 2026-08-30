import { z } from 'zod'
import {
  analysisRequirementBases,
  requirementImportances,
  requirementTypes,
} from '../../lib/job-requirements/constants'
import { hasSkillCategory, skillCategoryKeys } from '../../lib/skills/taxonomy'

/**
 * Candidate-independent structured job analysis. This schema is the single
 * contract for the combined prompts 14 + 15 call: it receives job-posting text
 * only and must never contain candidate fit, profile selection, match scores,
 * or resume/cover-letter output. Unknown keys are rejected so a model cannot
 * smuggle a fabricated fit score back into a stored analysis.
 *
 * Requirements own their importance and grounding; each requirement carries
 * zero or more structured skill references so the parser never emits a
 * parallel top-level skill list that must later be fuzzy-matched back to a
 * requirement.
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

export const skillReferenceSchema = z
  .object({
    rawLabel: z.string().trim().min(1).max(120),
    canonicalLabel: z.string().trim().min(1).max(120),
    category: z.string().trim().min(1).refine(hasSkillCategory),
    confidence: z.number().min(0).max(1),
  })
  .strict()

export type SkillReference = z.infer<typeof skillReferenceSchema>

export const jobRequirementSchema = z
  .object({
    type: z.enum(requirementTypes),
    importance: z.enum(requirementImportances),
    basis: z.enum(analysisRequirementBases),
    statement: z.string().trim().min(1).max(1000),
    sourceText: z.string().trim().min(1).max(2000),
    inferenceRationale: z.string().trim().min(1).max(2000).nullable(),
    skillReferences: z.array(skillReferenceSchema).max(20),
  })
  .strict()
  .superRefine((requirement, ctx) => {
    const seen = new Set<string>()
    for (const [index, reference] of requirement.skillReferences.entries()) {
      const key = reference.canonicalLabel.trim().toLocaleLowerCase()
      if (seen.has(key))
        ctx.addIssue({
          code: 'custom',
          message: `Duplicate skill reference "${reference.canonicalLabel}".`,
          path: ['skillReferences', index, 'canonicalLabel'],
        })
      seen.add(key)
    }
  })

const analysisText = z.string().trim().min(1).max(1000)
const analysisTextList = z.array(analysisText).max(20)

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
    painPoints: analysisTextList,
    culture: analysisTextList,
    redFlags: analysisTextList,
    successMetrics: analysisTextList,
    benefits: analysisTextList,
    notes: z.string().trim().max(5000).nullable(),
    interviewQuestions: z.array(analysisText).max(20),
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

export const jobAnalysisSchemaVersion = '4.0.0'

const stringSchema = { type: 'string' } as const
const nullableStringSchema = { type: ['string', 'null'] } as const

const skillReferenceJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    rawLabel: {
      type: 'string',
      description: 'The exact or tightly bounded skill wording used in the job posting.',
    },
    canonicalLabel: {
      type: 'string',
      description:
        'A concise canonical name for the skill. Server-side alias resolution is authoritative.',
    },
    category: {
      type: 'string',
      enum: [...skillCategoryKeys()],
      description: 'One controlled taxonomy category for this skill.',
    },
    confidence: {
      type: 'number',
      description: 'Parser confidence between 0 and 1.',
    },
  },
  required: ['rawLabel', 'canonicalLabel', 'category', 'confidence'],
}

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
    skillReferences: {
      type: 'array',
      items: skillReferenceJsonSchema,
      maxItems: 20,
      description:
        'Skills this specific requirement maps to. Empty when the requirement is not a skill requirement.',
    },
  },
  required: [
    'type',
    'importance',
    'basis',
    'statement',
    'sourceText',
    'inferenceRationale',
    'skillReferences',
  ],
}

const textListSchema = (description: string) => ({
  type: 'array',
  items: stringSchema,
  maxItems: 20,
  description,
})

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
    painPoints: textListSchema(
      'Business or technical problems the role appears intended to solve; empty when not supported.',
    ),
    culture: textListSchema(
      'Evidence-backed working-style or culture signals; empty when not supported.',
    ),
    redFlags: textListSchema(
      'Evidence-backed concerns or ambiguities; empty when none are evident.',
    ),
    successMetrics: textListSchema(
      'How success is explicitly or plausibly measured in the role; empty when not supported.',
    ),
    benefits: textListSchema(
      'Compensation-adjacent benefits or perks explicitly stated; empty when absent.',
    ),
    notes: {
      ...nullableStringSchema,
      description: 'Short factual context not represented by another field, or null.',
    },
    interviewQuestions: {
      type: 'array',
      items: stringSchema,
      maxItems: 20,
      description: 'Role-focused interview questions grounded in the posting.',
    },
  },
  required: [
    'summary',
    'classification',
    'requirements',
    'painPoints',
    'culture',
    'redFlags',
    'successMetrics',
    'benefits',
    'notes',
    'interviewQuestions',
  ],
} as const
