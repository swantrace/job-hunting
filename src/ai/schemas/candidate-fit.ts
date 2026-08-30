import { z } from 'zod'
import { evidenceRelevances, evidenceSourceTypes } from '../../lib/evidence/constants'

/**
 * Candidate-fit / evidence-matrix contract. This is the output of the combined
 * prompts 16 + 17 + 19 + 24 call. It is strict: unknown keys (notably any
 * opaque `overallFitScore`) are rejected, and the service layer further
 * validates every referenced profile and evidence ID against the frozen
 * canonical input.
 */

const fitRecommendations = ['apply', 'apply-selectively', 'skip'] as const
const evidenceStatuses = ['direct', 'transferable', 'missing'] as const
export const evidenceRefSchema = z
  .object({
    sourceType: z.enum(evidenceSourceTypes),
    sourceId: z.string().trim().min(1).max(120),
    relevance: z.enum(evidenceRelevances),
  })
  .strict()

const requirementAssessmentSchema = z
  .object({
    jobRequirementId: z.number().int().positive(),
    evidenceStatus: z.enum(evidenceStatuses),
    evidenceRefs: z.array(evidenceRefSchema).max(20),
    explanation: z.string().trim().min(1).max(2000),
    confidence: z.number().min(0).max(1),
  })
  .strict()

const alternativeSchema = z
  .object({
    profileId: z.string().trim().min(1).max(80),
    rationale: z.string().trim().min(1).max(2000),
  })
  .strict()

export const candidateFitSchema = z
  .object({
    fitRecommendation: z.enum(fitRecommendations),
    recommendationRationale: z.string().trim().min(1).max(3000),
    profileRecommendation: z
      .object({
        recommendedProfileId: z.string().trim().min(1).max(80),
        rationale: z.string().trim().min(1).max(2000),
        alternatives: z.array(alternativeSchema).max(10),
      })
      .strict(),
    requirementAssessments: z.array(requirementAssessmentSchema).min(1).max(80),
    strengths: z.array(z.string().trim().min(1).max(2000)).max(30),
    concerns: z.array(z.string().trim().min(1).max(2000)).max(30),
    interviewPreparation: z.array(z.string().trim().min(1).max(2000)).max(30),
    careerDataSuggestions: z
      .array(
        z
          .object({
            jobRequirementId: z.number().int().positive(),
            suggestion: z.string().trim().min(1).max(2000),
          })
          .strict(),
      )
      .max(40),
  })
  .strict()
  .superRefine((result, ctx) => {
    const requirementIds = new Set<number>()
    for (const [index, assessment] of result.requirementAssessments.entries()) {
      if (requirementIds.has(assessment.jobRequirementId))
        ctx.addIssue({
          code: 'custom',
          message: `Duplicate requirement assessment for jobRequirementId ${assessment.jobRequirementId}.`,
          path: ['requirementAssessments', index, 'jobRequirementId'],
        })
      requirementIds.add(assessment.jobRequirementId)

      if (
        (assessment.evidenceStatus === 'direct' || assessment.evidenceStatus === 'transferable') &&
        assessment.evidenceRefs.length === 0
      )
        ctx.addIssue({
          code: 'custom',
          message: 'Direct and transferable assessments require at least one evidence reference.',
          path: ['requirementAssessments', index, 'evidenceRefs'],
        })

      if (assessment.evidenceStatus === 'missing' && assessment.evidenceRefs.length > 0)
        ctx.addIssue({
          code: 'custom',
          message: 'Missing assessments must not contain evidence references.',
          path: ['requirementAssessments', index, 'evidenceRefs'],
        })

      const seenRefs = new Set<string>()
      for (const [refIndex, ref] of assessment.evidenceRefs.entries()) {
        const key = `${ref.sourceType}:${ref.sourceId}`
        if (seenRefs.has(key))
          ctx.addIssue({
            code: 'custom',
            message: `Duplicate evidence reference "${key}".`,
            path: ['requirementAssessments', index, 'evidenceRefs', refIndex],
          })
        seenRefs.add(key)
      }
    }
  })

export type CandidateFit = z.infer<typeof candidateFitSchema>
export type RequirementAssessment = z.infer<typeof requirementAssessmentSchema>
export type EvidenceRef = z.infer<typeof evidenceRefSchema>

const stringSchema = { type: 'string' } as const

const evidenceRefJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    sourceType: { type: 'string', enum: [...evidenceSourceTypes] },
    sourceId: { type: 'string', description: 'A canonical source ID from the frozen input.' },
    relevance: { type: 'string', enum: [...evidenceRelevances] },
  },
  required: ['sourceType', 'sourceId', 'relevance'],
}

export const candidateFitResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    fitRecommendation: {
      type: 'string',
      enum: [...fitRecommendations],
      description: 'apply, apply-selectively, or skip. Never a numeric score.',
    },
    recommendationRationale: stringSchema,
    profileRecommendation: {
      type: 'object',
      additionalProperties: false,
      properties: {
        recommendedProfileId: stringSchema,
        rationale: stringSchema,
        alternatives: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: { profileId: stringSchema, rationale: stringSchema },
            required: ['profileId', 'rationale'],
          },
        },
      },
      required: ['recommendedProfileId', 'rationale', 'alternatives'],
    },
    requirementAssessments: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          jobRequirementId: { type: 'integer' },
          evidenceStatus: { type: 'string', enum: [...evidenceStatuses] },
          evidenceRefs: { type: 'array', items: evidenceRefJsonSchema },
          explanation: stringSchema,
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
        required: [
          'jobRequirementId',
          'evidenceStatus',
          'evidenceRefs',
          'explanation',
          'confidence',
        ],
      },
    },
    strengths: { type: 'array', items: stringSchema },
    concerns: { type: 'array', items: stringSchema },
    interviewPreparation: { type: 'array', items: stringSchema },
    careerDataSuggestions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { jobRequirementId: { type: 'integer' }, suggestion: stringSchema },
        required: ['jobRequirementId', 'suggestion'],
      },
    },
  },
  required: [
    'fitRecommendation',
    'recommendationRationale',
    'profileRecommendation',
    'requirementAssessments',
    'strengths',
    'concerns',
    'interviewPreparation',
    'careerDataSuggestions',
  ],
} as const
