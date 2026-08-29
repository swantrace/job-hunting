import { z } from 'zod'

const severities = ['blocking', 'important', 'optional'] as const

export const documentReviewFindingSchema = z
  .object({
    severity: z.enum(severities),
    section: z.string().trim().min(1).max(200),
    claim: z.string().trim().min(1).max(2000),
    message: z.string().trim().min(1).max(2000),
  })
  .strict()

export const documentReviewSchema = z
  .object({
    summary: z.string().trim().min(1).max(3000),
    findings: z.array(documentReviewFindingSchema).max(40),
  })
  .strict()

export type DocumentReview = z.infer<typeof documentReviewSchema>
export type DocumentReviewFinding = z.infer<typeof documentReviewFindingSchema>

export const documentReviewSchemaVersion = '1.0.0'

const stringSchema = { type: 'string' } as const

export const documentReviewResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: stringSchema,
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          severity: { type: 'string', enum: [...severities] },
          section: {
            type: 'string',
            description: 'The affected section or claim reference, never a rewrite.',
          },
          claim: { type: 'string', description: 'The affected text or claim.' },
          message: {
            type: 'string',
            description: 'A concise observation or concern; never a rewritten document.',
          },
        },
        required: ['severity', 'section', 'claim', 'message'],
      },
    },
  },
  required: ['summary', 'findings'],
} as const
