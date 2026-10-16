import { z } from 'zod'
import { jobAnalysisSchema } from '../ai/schemas/job-analysis'
import { followUpActionTypes, interviewRoundTypes } from './activities/constants'
import {
  activeStatuses,
  applicationSortValues,
  applicationViews,
  type JobStatus,
  priorities,
} from './applications/constants'
import { hasDirection } from './career/directions'
import { isISODate, isISOTimestamp } from './date'
import { skillReviewStatuses } from './skills/constants'
import { hasSkillCategory } from './skills/taxonomy'
import { workspaceTabs } from './workspace/constants'

const emptyToNull = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? null : value
const optionalText = (max: number) =>
  z.preprocess(emptyToNull, z.string().trim().max(max).nullable().optional())
const optionalUrl = z.preprocess(
  emptyToNull,
  z.string().trim().url().max(2048).nullable().optional(),
)
const isoDate = z.string().refine(isISODate, 'Use a valid YYYY-MM-DD date')
export const isoTimestamp = z
  .string()
  .refine(isISOTimestamp, 'Use a valid UTC ISO 8601 timestamp with a Z designator')
const direction = z
  .string()
  .trim()
  .min(1, 'Direction is required')
  .max(80)
  .refine(hasDirection, 'Choose a valid direction')

function parseJsonField(value: unknown) {
  if (typeof value !== 'string' || value.trim() === '') return undefined
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

export function parseJobAnalysisValue(value: unknown) {
  const prepared = parseJsonField(value)
  if (prepared === undefined) return undefined
  const parsed = jobAnalysisSchema.safeParse(prepared)
  return parsed.success ? parsed.data : undefined
}

export const quickCollectSchema = z.object({
  jobTitle: z.string().trim().min(1, 'Job title is required').max(200),
  companyName: z.string().trim().min(1, 'Company is required').max(200),
  direction,
  location: optionalText(200),
  url: optionalUrl,
  postedDate: z.preprocess(emptyToNull, isoDate.nullable()),
  salary: optionalText(500),
  applicationSource: optionalText(150),
  jobPostText: optionalText(100000),
  parserModel: optionalText(100),
  parserPromptVersion: optionalText(50),
  jobAnalysis: z.preprocess(parseJsonField, jobAnalysisSchema.optional()),
  analysisSchemaVersion: optionalText(50),
  analysisPromptVersion: optionalText(50),
})

export const applicationSchema = z.object({
  jobTitle: z.string().trim().min(1).max(200),
  companyName: z.string().trim().min(1).max(200),
  direction,
  location: optionalText(200),
  url: optionalUrl,
  postedDate: z.preprocess(emptyToNull, isoDate.nullable()),
  priority: z.enum(priorities),
  appliedDate: z.preprocess(emptyToNull, isoDate.nullable()),
  applicationSource: optionalText(150),
  salary: optionalText(500),
  notes: optionalText(5000),
})

export const statusSchema = z.object({
  action: z.enum(['today', 'reject', 'archive', 'restore', 'applied']),
})
export const followUpSchema = z.object({
  actionDate: isoDate,
  actionType: z.enum(followUpActionTypes),
  notes: optionalText(2000),
})
export const interviewSchema = z.object({
  interviewDate: isoDate,
  roundName: z.string().trim().min(1).max(150),
  roundType: z.enum(interviewRoundTypes),
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
export const managedSkillSchema = skillSchema.extend({
  category: z.preprocess(
    emptyToNull,
    z.string().trim().min(1).refine(hasSkillCategory).nullable().optional(),
  ),
  reviewStatus: z.enum(skillReviewStatuses),
})
export const skillDecisionSchemaFor = (transferable = false) =>
  z
    .object({
      action: z.enum(['skip', 'include']),
      reason: z.string().trim().max(2000).default(''),
    })
    .superRefine((value, ctx) => {
      if (value.action === 'include' && !transferable && value.reason.trim() === '')
        ctx.addIssue({
          code: 'custom',
          message: 'A reason is required to include this skill.',
          path: ['reason'],
        })
    })
export const skillDecisionSchema = skillDecisionSchemaFor()
export const companySchema = z.object({
  name: z.string().trim().min(1).max(200),
  website: optionalUrl,
})
export const managedContactSchema = contactSchema.extend({
  companyId: z.coerce.number().int().positive(),
})
export const baselineGenerationSchema = z.object({
  direction,
  targetTitle: optionalText(200),
  targetKeywords: optionalText(1000),
})

export { applicationSortValues as sortValues }
export const filterSchema = z.object({
  q: z.string().trim().max(200).catch(''),
  priority: z.enum(['', ...priorities]).catch(''),
  statuses: z.string().trim().max(200).catch(''),
  view: z.enum(applicationViews).catch('list'),
  today: z.enum(['', '1']).catch(''),
  attributes: z.string().trim().max(500).catch(''),
  sort: z.enum(applicationSortValues).catch('updated_desc'),
})

export const applicationAttributes = [
  'company',
  'title',
  'location',
  'priority',
  'status',
  'appliedDate',
  'targetDate',
  'source',
  'notes',
] as const
export type ApplicationAttribute = (typeof applicationAttributes)[number]
export const applicationAttributeLabels: Record<ApplicationAttribute, string> = {
  company: 'Company',
  title: 'Job title',
  location: 'Location',
  priority: 'Priority',
  status: 'Status',
  appliedDate: 'Applied date',
  targetDate: 'Target date',
  source: 'Source',
  notes: 'Notes',
}
export const defaultAttributes = [
  'company',
  'title',
  'status',
  'priority',
  'location',
  'appliedDate',
] as ApplicationAttribute[]

export const parseCsvList = (value?: string) =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

export const statusesFromFilters = (filters: { statuses: string; today: string }): JobStatus[] => {
  if (filters.today === '1') return ['Apply Today']
  const requested = parseCsvList(filters.statuses) as JobStatus[]
  return requested.length ? requested : ([...activeStatuses] as JobStatus[])
}

export const workspaceTabSchema = z.enum(workspaceTabs).catch('application')

export type FieldErrors = Record<string, string[] | undefined>

/**
 * Converts submitted form data into an object. A name submitted more than once
 * (the ordered checkbox list a `RelationPicker` renders) becomes a string array
 * in submission order; a name submitted once keeps its single value, so every
 * existing one-value-per-name form is unchanged. The loose value type matches
 * the previous `Object.fromEntries(form.entries())` contract callers rely on.
 */
// biome-ignore lint/suspicious/noExplicitAny: preserves the previous FormData entry contract.
export function formObject(form: FormData): Record<string, any> {
  const values: Record<string, any> = {}
  for (const [key, value] of form.entries()) {
    const existing = values[key]
    if (existing === undefined) values[key] = value
    else if (Array.isArray(existing)) existing.push(value)
    else values[key] = [existing, value]
  }
  return values
}
