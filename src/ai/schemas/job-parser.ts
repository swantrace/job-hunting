import { z } from 'zod'

export const parsedJobSchema = z.object({
  jobTitle: z.string().trim().max(200),
  location: z.string().trim().max(200).nullable(),
  postedDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  skills: z.array(z.string().trim().max(80)).max(30),
  salary: z.string().trim().max(150).nullable(),
  requirements: z.array(z.string().trim().max(1000)).max(30),
  responsibilities: z.array(z.string().trim().max(1000)).max(30),
  painPoints: z.array(z.string().trim().max(1000)).max(20),
  culture: z.array(z.string().trim().max(1000)).max(20),
  redFlags: z.array(z.string().trim().max(1000)).max(20),
  successMetrics: z.array(z.string().trim().max(1000)).max(20),
  benefits: z.array(z.string().trim().max(1000)).max(20),
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
    location: {
      type: ['string', 'null'],
      description: 'City, region, remote, hybrid, or onsite arrangement, or null if unknown.',
    },
    postedDate: {
      type: ['string', 'null'],
      description: 'Explicit posting date in YYYY-MM-DD format, or null if unknown.',
    },
    skills: {
      type: 'array',
      items: { type: 'string' },
      description: 'Short, lowercase, deduplicated technical skills, domain knowledge, and tools.',
    },
    salary: {
      type: ['string', 'null'],
      description: 'Salary or compensation text exactly as stated, or null.',
    },
    requirements: {
      type: 'array',
      items: { type: 'string' },
      description: 'Explicit qualifications, experience, or capability requirements.',
    },
    responsibilities: {
      type: 'array',
      items: { type: 'string' },
      description: 'Core responsibilities and deliverables for the role.',
    },
    painPoints: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Business or technical problems the role appears intended to solve; empty when not supported.',
    },
    culture: {
      type: 'array',
      items: { type: 'string' },
      description: 'Evidence-backed working-style or culture signals; empty when not supported.',
    },
    redFlags: {
      type: 'array',
      items: { type: 'string' },
      description: 'Evidence-backed concerns or ambiguities; empty when none are evident.',
    },
    successMetrics: {
      type: 'array',
      items: { type: 'string' },
      description:
        'How success is explicitly or plausibly measured in the role; empty when not supported.',
    },
    benefits: {
      type: 'array',
      items: { type: 'string' },
      description: 'Compensation-adjacent benefits or perks explicitly stated; empty when absent.',
    },
    notes: {
      type: ['string', 'null'],
      description: 'Short factual context not represented by another field, or null.',
    },
  },
  required: [
    'jobTitle',
    'location',
    'postedDate',
    'skills',
    'salary',
    'requirements',
    'responsibilities',
    'painPoints',
    'culture',
    'redFlags',
    'successMetrics',
    'benefits',
    'notes',
  ],
} as const
