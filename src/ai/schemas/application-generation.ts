import { z } from 'zod'
import { evidenceSourceTypes } from '../../lib/evidence/constants'

export const applicationGenerationSchemaVersion = '2.1.0'

const text = z.string().trim().min(1).max(2200)
const companyInterestSources = ['job-posting', 'user-note'] as const

const skillItemsSchema = z.union([text, z.array(z.string().trim().min(1).max(100)).min(1).max(30)])

export const evidenceRefSchema = z.object({
  sourceType: z.enum(evidenceSourceTypes),
  sourceId: z.string().trim().min(1).max(120),
})

export const evidenceTextSchema = z.object({
  text,
  evidenceRefs: z.array(evidenceRefSchema).max(20),
})

export type EvidenceRef = z.infer<typeof evidenceRefSchema>

export const tailoredResumeSchema = z.object({
  targetTitle: z.string().trim().min(1).max(150),
  summary: evidenceTextSchema,
  skills: z
    .array(z.object({ label: z.string().trim().min(1).max(100), items: skillItemsSchema }))
    .min(1)
    .max(8),
  experienceBullets: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        bullets: z.array(evidenceTextSchema).min(1).max(6),
      }),
    )
    .max(20),
  selectedProjectIds: z.array(z.string().trim().min(1)).max(2),
})

export const tailoredCoverLetterSchema = z.object({
  salutation: z.string().trim().min(1).max(100),
  openingParagraph: text,
  evidenceParagraphs: z.array(evidenceTextSchema).min(1).max(3),
  companyInterestParagraph: text,
  companyInterestSource: z.enum(companyInterestSources),
  includeAuthorization: z.boolean(),
  authorizationParagraph: z.string().trim().max(800),
  closingParagraph: text,
})

export type TailoredResume = z.infer<typeof tailoredResumeSchema>
export type TailoredCoverLetter = z.infer<typeof tailoredCoverLetterSchema>

const stringSchema = { type: 'string' } as const

const evidenceRefJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    sourceType: {
      type: 'string',
      enum: [...evidenceSourceTypes],
    },
    sourceId: { type: 'string', description: 'A canonical source ID from the frozen snapshot.' },
  },
  required: ['sourceType', 'sourceId'],
}

const evidenceTextJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    text: stringSchema,
    evidenceRefs: { type: 'array', items: evidenceRefJsonSchema },
  },
  required: ['text', 'evidenceRefs'],
}

export const tailoredResumeResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    targetTitle: stringSchema,
    summary: evidenceTextJsonSchema,
    skills: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          label: stringSchema,
          items: { type: ['string', 'array'], items: stringSchema },
        },
        required: ['label', 'items'],
      },
    },
    experienceBullets: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { id: stringSchema, bullets: { type: 'array', items: evidenceTextJsonSchema } },
        required: ['id', 'bullets'],
      },
    },
    selectedProjectIds: { type: 'array', items: stringSchema },
  },
  required: ['targetTitle', 'summary', 'skills', 'experienceBullets', 'selectedProjectIds'],
} as const

export const tailoredCoverLetterResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    salutation: stringSchema,
    openingParagraph: stringSchema,
    evidenceParagraphs: { type: 'array', items: evidenceTextJsonSchema },
    companyInterestParagraph: stringSchema,
    companyInterestSource: { type: 'string', enum: [...companyInterestSources] },
    includeAuthorization: { type: 'boolean' },
    authorizationParagraph: stringSchema,
    closingParagraph: stringSchema,
  },
  required: [
    'salutation',
    'openingParagraph',
    'evidenceParagraphs',
    'companyInterestParagraph',
    'companyInterestSource',
    'includeAuthorization',
    'authorizationParagraph',
    'closingParagraph',
  ],
} as const
