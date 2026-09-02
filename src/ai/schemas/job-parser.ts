import { z } from 'zod'
import { type JobAnalysis, jobAnalysisResponseSchema, jobAnalysisSchema } from './job-analysis'

/**
 * The combined job-analysis call parses the application facts that are
 * model-extractable: job title, location, posted date, salary, and a proposed
 * direction. Company, URL, and application source remain user-provided. All
 * other content (skills, requirements, responsibilities, pain points, culture,
 * red flags, success metrics, benefits, notes, and interview questions) lives
 * inside the nested structured `analysis` object.
 */
export const parsedJobSchema = z.object({
  jobTitle: z.string().trim().max(200),
  location: z.string().trim().max(200).nullable(),
  postedDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  salary: z.string().trim().max(150).nullable(),
  direction: z.string().trim().min(1).max(80),
})

export type ParsedJob = z.infer<typeof parsedJobSchema>

/**
 * The combined prompts 14 + 15 result. The top level carries only the factual
 * parser fields while the nested `analysis` object carries the structured,
 * candidate-independent contract whose requirements own their skill mappings.
 */
export const parsedJobWithAnalysisSchema = parsedJobSchema.extend({
  analysis: jobAnalysisSchema,
})
export type ParsedJobWithAnalysis = z.infer<typeof parsedJobWithAnalysisSchema>
export type { JobAnalysis }

export function jobParserResponseSchema(directionIds: string[]) {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      jobTitle: {
        type: 'string',
        description: 'Official position title, without the company name.',
      },
      location: {
        type: ['string', 'null'],
        description: 'City, region, remote, hybrid, or onsite arrangement, or null if unknown.',
      },
      postedDate: {
        type: ['string', 'null'],
        description: 'Explicit posting date in YYYY-MM-DD format, or null if unknown.',
      },
      salary: {
        type: ['string', 'null'],
        description: 'Salary or compensation text exactly as stated, or null.',
      },
      direction: {
        type: 'string',
        enum: directionIds,
        description: 'The single best-fit direction id from the supplied available directions.',
      },
    },
    required: ['jobTitle', 'location', 'postedDate', 'salary', 'direction'],
  } as const
}

/**
 * Provider JSON schema for the single combined job-analysis call. It reuses the
 * parser field definitions and nests the structured analysis contract so the
 * OpenAI JSON schema and the Zod schema describe the same required fields and
 * enums.
 */
export function jobAnalysisCombinedResponseSchema(directionIds: string[]) {
  const parserSchema = jobParserResponseSchema(directionIds)
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      ...parserSchema.properties,
      analysis: jobAnalysisResponseSchema,
    },
    required: [...parserSchema.required, 'analysis'],
  } as const
}
