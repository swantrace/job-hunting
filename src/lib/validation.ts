import { z } from 'zod'
import { matchLevels, priorities, statuses } from '../db/schema'
import { isISODate } from './date'
import { hasProfile } from './profiles'

const emptyToNull = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? null : value
const optionalText = (max: number) =>
  z.preprocess(emptyToNull, z.string().trim().max(max).nullable().optional())
const optionalUrl = z.preprocess(
  emptyToNull,
  z.string().trim().url().max(2048).nullable().optional(),
)
const isoDate = z.string().refine(isISODate, 'Use a valid YYYY-MM-DD date')
const direction = z
  .string()
  .trim()
  .min(1, 'Direction is required')
  .max(80)
  .refine(hasProfile, 'Choose a valid direction')
const analysisText = optionalText(12000)

export const quickCollectSchema = z.object({
  jobTitle: z.string().trim().min(1, 'Job title is required').max(200),
  companyName: z.string().trim().min(1, 'Company is required').max(200),
  direction,
  location: optionalText(200),
  url: optionalUrl,
  postedDate: isoDate,
  salary: optionalText(150),
  applicationSource: optionalText(150),
  skills: optionalText(1000),
  jobPostText: optionalText(100000),
  analysisRequirements: analysisText,
  analysisResponsibilities: analysisText,
  analysisPainPoints: analysisText,
  analysisCulture: analysisText,
  analysisRedFlags: analysisText,
  analysisSuccessMetrics: analysisText,
  analysisBenefits: analysisText,
  analysisNotes: optionalText(5000),
  parserModel: optionalText(100),
  parserPromptVersion: optionalText(50),
})

export const applicationSchema = z.object({
  jobTitle: z.string().trim().min(1).max(200),
  companyName: z.string().trim().min(1).max(200),
  direction,
  location: optionalText(200),
  url: optionalUrl,
  postedDate: isoDate,
  priority: z.enum(priorities),
  appliedDate: z.preprocess(emptyToNull, isoDate.nullable()),
  resumeVersion: optionalText(100),
  matchLevel: z.preprocess(emptyToNull, z.enum(matchLevels).nullable()),
  applicationSource: optionalText(150),
  salary: optionalText(150),
  notes: optionalText(5000),
  skills: optionalText(1000),
})

export const statusSchema = z.object({ action: z.enum(['today', 'reject', 'archive', 'restore']) })
export const followUpSchema = z.object({ actionDate: isoDate, notes: optionalText(2000) })
export const interviewSchema = z.object({
  interviewDate: isoDate,
  roundName: z.string().trim().min(1).max(150),
  notes: optionalText(2000),
})
export const contactSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(150),
  email: optionalText(320).refine(
    (value) => value === null || z.string().email().safeParse(value).success,
    'Enter a valid email address',
  ),
  linkedinUrl: z.preprocess(emptyToNull, z.string().trim().url().max(2048).nullable().optional()),
})
export const skillSchema = z.object({ name: z.string().trim().min(1).max(80) })
export const companySchema = z.object({
  name: z.string().trim().min(1).max(200),
  website: optionalUrl,
})
export const managedContactSchema = contactSchema.extend({
  companyId: z.coerce.number().int().positive(),
})

export const sortValues = [
  'updated_desc',
  'posted_desc',
  'posted_asc',
  'company_asc',
  'company_desc',
  'priority_asc',
  'priority_desc',
  'target_asc',
  'applied_desc',
  'applied_asc',
] as const
export const filterSchema = z.object({
  q: z.string().trim().max(200).catch(''),
  priority: z.enum(['', ...priorities]).catch(''),
  view: z.enum(['active', 'Rejected', 'Archived']).catch('active'),
  today: z.enum(['', '1']).catch(''),
  sort: z.enum(sortValues).catch('updated_desc'),
})

export type FieldErrors = Record<string, string[] | undefined>
export const formObject = (form: FormData) => Object.fromEntries(form.entries())
