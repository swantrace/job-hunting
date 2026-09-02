import { z } from 'zod'

export const documentReviewSeverities = ['blocking', 'important', 'optional'] as const
export const documentReviewVerdicts = ['approve', 'revise'] as const
export const documentReviewDocuments = ['resume', 'cover-letter', 'cross-document'] as const
export const documentReviewCategories = [
  'truthfulness',
  'targeting',
  'evidence-selection',
  'editorial-quality',
  'structure',
  'cover-letter-value',
  'cross-document-consistency',
] as const

export const documentReviewFindingSchema = z
  .object({
    severity: z.enum(documentReviewSeverities),
    document: z.enum(documentReviewDocuments),
    category: z.enum(documentReviewCategories),
    section: z.string().trim().min(1).max(200),
    claim: z.string().trim().min(1).max(2000),
    message: z.string().trim().min(1).max(2000),
    recommendedAction: z.string().trim().min(1).max(2000),
  })
  .strict()

export const documentReviewSchema = z
  .object({
    verdict: z.enum(documentReviewVerdicts),
    summary: z.string().trim().min(1).max(3000),
    findings: z.array(documentReviewFindingSchema).max(40),
  })
  .strict()

export type DocumentReview = z.infer<typeof documentReviewSchema>
export type DocumentReviewFinding = z.infer<typeof documentReviewFindingSchema>

export const documentReviewSchemaVersion = '2.0.0'

const stringSchema = { type: 'string' } as const

export const documentReviewResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: [...documentReviewVerdicts] },
    summary: stringSchema,
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          severity: { type: 'string', enum: [...documentReviewSeverities] },
          document: { type: 'string', enum: [...documentReviewDocuments] },
          category: { type: 'string', enum: [...documentReviewCategories] },
          section: {
            type: 'string',
            description: 'The affected section or claim reference, never a rewrite.',
          },
          claim: { type: 'string', description: 'The affected text or claim.' },
          message: {
            type: 'string',
            description: 'A concise observation or concern; never a rewritten document.',
          },
          recommendedAction: {
            type: 'string',
            description: 'The smallest actionable revision, not a rewritten complete document.',
          },
        },
        required: [
          'severity',
          'document',
          'category',
          'section',
          'claim',
          'message',
          'recommendedAction',
        ],
      },
    },
  },
  required: ['verdict', 'summary', 'findings'],
} as const
