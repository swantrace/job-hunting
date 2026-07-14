import { z } from 'zod'

export const tailoredResumeSchema = z.object({
  targetTitle: z.string().trim().min(1).max(150),
  summary: z.string().trim().min(1).max(2200),
  skills: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(100),
        items: z.string().trim().min(1).max(700),
      }),
    )
    .min(1)
    .max(8),
  experienceBullets: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(100),
        bullets: z.array(z.string().trim().min(1).max(700)).min(1).max(6),
      }),
    )
    .max(20),
})

export const tailoredCoverLetterSchema = z.object({
  salutation: z.string().trim().min(1).max(100),
  openingParagraph: z.string().trim().min(1).max(1800),
  evidenceParagraph: z.string().trim().min(1).max(2200),
  companyInterestParagraph: z.string().trim().min(1).max(1600),
  closingParagraph: z.string().trim().min(1).max(1200),
})

export type TailoredResume = z.infer<typeof tailoredResumeSchema>
export type TailoredCoverLetter = z.infer<typeof tailoredCoverLetterSchema>

const stringSchema = { type: 'string' } as const

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
        properties: {
          id: stringSchema,
          bullets: { type: 'array', items: stringSchema },
        },
        required: ['id', 'bullets'],
      },
    },
  },
  required: ['targetTitle', 'summary', 'skills', 'experienceBullets'],
} as const

export const tailoredCoverLetterResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    salutation: stringSchema,
    openingParagraph: stringSchema,
    evidenceParagraph: stringSchema,
    companyInterestParagraph: stringSchema,
    closingParagraph: stringSchema,
  },
  required: [
    'salutation',
    'openingParagraph',
    'evidenceParagraph',
    'companyInterestParagraph',
    'closingParagraph',
  ],
} as const
