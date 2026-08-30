import { z } from 'zod'
import { type JobAnalysis, jobAnalysisResponseSchema, jobAnalysisSchema } from './job-analysis'

/**
 * The combined job-analysis call parses only the application facts that are
 * model-extractable: job title, location, posted date, and salary. Company,
 * URL, application source, and direction are deliberately user-provided and
 * never part of this schema. All other content (skills, requirements,
 * responsibilities, pain points, culture, red flags, success metrics,
 * benefits, notes, and interview questions) lives inside the nested structured
 * `analysis` object.
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

export const jobParserResponseSchema = {
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
  },
  required: ['jobTitle', 'location', 'postedDate', 'salary'],
} as const

/**
 * Provider JSON schema for the single combined job-analysis call. It reuses the
 * parser field definitions and nests the structured analysis contract so the
 * OpenAI JSON schema and the Zod schema describe the same required fields and
 * enums.
 */
export const jobAnalysisCombinedResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ...jobParserResponseSchema.properties,
    analysis: jobAnalysisResponseSchema,
  },
  required: [...jobParserResponseSchema.required, 'analysis'],
} as const
