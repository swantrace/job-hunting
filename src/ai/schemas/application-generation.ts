import { z } from 'zod'

const text = z.string().trim().min(1).max(2200)

export const tailoredResumeSchema = z.object({
  targetTitle: z.string().trim().min(1).max(150),
  summary: text,
  skills: z
    .array(z.object({ label: z.string().trim().min(1).max(100), items: text }))
    .min(1)
    .max(8),
  experienceBullets: z
    .array(z.object({ id: z.string().trim().min(1), bullets: z.array(text).min(1).max(6) }))
    .max(20),
  selectedProjectIds: z.array(z.string().trim().min(1)).max(2),
})

export const tailoredCoverLetterSchema = z.object({
  salutation: z.string().trim().min(1).max(100),
  openingParagraph: text,
  evidenceParagraphs: z.array(z.object({ text })).min(1).max(3),
  companyInterestParagraph: text,
  includeAuthorization: z.boolean(),
  authorizationParagraph: z.string().trim().max(800),
  closingParagraph: text,
})

export type TailoredResume = z.infer<typeof tailoredResumeSchema>
export type TailoredCoverLetter = z.infer<typeof tailoredCoverLetterSchema>

const stringSchema = { type: 'string' } as const
const textArray = { type: 'array', items: stringSchema } as const

export const tailoredResumeResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    targetTitle: stringSchema,
    summary: stringSchema,
    skills: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { label: stringSchema, items: stringSchema },
        required: ['label', 'items'],
      },
    },
    experienceBullets: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { id: stringSchema, bullets: textArray },
        required: ['id', 'bullets'],
      },
    },
    selectedProjectIds: textArray,
  },
  required: ['targetTitle', 'summary', 'skills', 'experienceBullets', 'selectedProjectIds'],
} as const

export const tailoredCoverLetterResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    salutation: stringSchema,
    openingParagraph: stringSchema,
    evidenceParagraphs: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { text: stringSchema },
        required: ['text'],
      },
    },
    companyInterestParagraph: stringSchema,
    includeAuthorization: { type: 'boolean' },
    authorizationParagraph: stringSchema,
    closingParagraph: stringSchema,
  },
  required: [
    'salutation',
    'openingParagraph',
    'evidenceParagraphs',
    'companyInterestParagraph',
    'includeAuthorization',
    'authorizationParagraph',
    'closingParagraph',
  ],
} as const
