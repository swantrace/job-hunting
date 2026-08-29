import { z } from 'zod'
import { skillImportances } from '../../lib/skills/constants'
import { hasSkillCategory, skillCategoryKeys } from '../../lib/skills/taxonomy'

const categories = skillCategoryKeys()

export const skillRequirementItemSchema = z.object({
  rawLabel: z.string().trim().min(1).max(120),
  canonicalLabel: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).refine(hasSkillCategory),
  importance: z.enum(skillImportances),
  sourceText: z.string().trim().min(1).max(1000),
  confidence: z.number().min(0).max(1),
})

export const parsedJobSchema = z.object({
  jobTitle: z.string().trim().max(200),
  location: z.string().trim().max(200).nullable(),
  postedDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  skills: z.array(skillRequirementItemSchema).max(30),
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
export type ParsedSkillRequirement = z.infer<typeof skillRequirementItemSchema>

const skillItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    rawLabel: {
      type: 'string',
      description: 'The exact or tightly bounded skill wording used in the job posting.',
    },
    canonicalLabel: {
      type: 'string',
      description:
        'A concise canonical name for the skill. Server-side alias resolution is authoritative.',
    },
    category: {
      type: 'string',
      enum: categories,
      description: 'One controlled taxonomy category for this skill.',
    },
    importance: {
      type: 'string',
      enum: [...skillImportances],
      description: 'required, preferred, or merely mentioned.',
    },
    sourceText: {
      type: 'string',
      description: 'A short exact excerpt from the posting that supports this skill.',
    },
    confidence: {
      type: 'number',
      description: 'Parser confidence between 0 and 1.',
    },
  },
  required: ['rawLabel', 'canonicalLabel', 'category', 'importance', 'sourceText', 'confidence'],
}

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
      items: skillItemSchema,
      maxItems: 30,
      description:
        'Up to 30 structured skill requirements, deduplicated by canonical label, with a source excerpt and controlled category/importance.',
    },
    salary: {
      type: ['string', 'null'],
      description: 'Salary or compensation text exactly as stated, or null.',
    },
    requirements: {
      type: 'array',
      items: { type: 'string' },
      maxItems: 30,
      description: 'Explicit qualifications, experience, or capability requirements.',
    },
    responsibilities: {
      type: 'array',
      items: { type: 'string' },
      maxItems: 30,
      description: 'Core responsibilities and deliverables for the role.',
    },
    painPoints: {
      type: 'array',
      items: { type: 'string' },
      maxItems: 20,
      description:
        'Business or technical problems the role appears intended to solve; empty when not supported.',
    },
    culture: {
      type: 'array',
      items: { type: 'string' },
      maxItems: 20,
      description: 'Evidence-backed working-style or culture signals; empty when not supported.',
    },
    redFlags: {
      type: 'array',
      items: { type: 'string' },
      maxItems: 20,
      description: 'Evidence-backed concerns or ambiguities; empty when none are evident.',
    },
    successMetrics: {
      type: 'array',
      items: { type: 'string' },
      maxItems: 20,
      description:
        'How success is explicitly or plausibly measured in the role; empty when not supported.',
    },
    benefits: {
      type: 'array',
      items: { type: 'string' },
      maxItems: 20,
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
}
