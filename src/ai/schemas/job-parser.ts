import { z } from 'zod'

export const parsedJobSchema = z.object({
  jobTitle: z.string().trim().max(200),
  companyName: z.string().trim().max(200),
  location: z.string().trim().max(200).nullable(),
  url: z.string().trim().url().max(2048).nullable(),
  postedDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  tags: z.array(z.string().trim().max(50)).max(20),
  applicationSource: z.string().trim().max(150).nullable(),
  salary: z.string().trim().max(150).nullable(),
  notes: z.string().trim().max(5000).nullable(),
})

export type ParsedJob = z.infer<typeof parsedJobSchema>

export const jobParserResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    jobTitle: {
      type: 'string',
      description: 'Official position title, without the company name.',
    },
    companyName: {
      type: 'string',
      description: 'Hiring company or organization; never the literal string null.',
    },
    location: {
      type: ['string', 'null'],
      description: 'City, region, remote, hybrid, or onsite arrangement, or null if unknown.',
    },
    url: {
      type: ['string', 'null'],
      description: 'Explicit job URL from the input, or null if none is present.',
    },
    postedDate: {
      type: ['string', 'null'],
      description: 'Explicit posting date in YYYY-MM-DD format, or null if unknown.',
    },
    tags: {
      type: 'array',
      items: { type: 'string' },
      description: 'Short, lowercase, deduplicated categories or technologies.',
    },
    applicationSource: {
      type: ['string', 'null'],
      description: 'Where the posting came from if stated, otherwise null.',
    },
    salary: {
      type: ['string', 'null'],
      description: 'Salary or compensation text exactly as stated, or null.',
    },
    notes: {
      type: ['string', 'null'],
      description: 'Short factual context not represented by another field, or null.',
    },
  },
  required: [
    'jobTitle',
    'companyName',
    'location',
    'url',
    'postedDate',
    'tags',
    'applicationSource',
    'salary',
    'notes',
  ],
} as const
