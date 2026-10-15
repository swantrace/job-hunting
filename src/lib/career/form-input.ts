import { z } from 'zod'
import type { CareerDirectionInput, CareerDirectionUpdateInput } from '../../db/career-directions'
import type { CareerCandidateInput, CareerPreferencesInput } from '../../db/career-facts'
import type {
  CareerAchievementInput,
  CareerDatePrecision,
  CareerEducationInput,
  CareerExperienceInput,
  CareerPortfolioTopicInput,
  CareerProjectInput,
  CareerPublicationInput,
  CareerPublicationStatus,
  CareerStoryInput,
} from '../../db/career-records'
import type { CareerSkillInput, CareerSkillUpdateInput } from '../../db/career-skills'
import type { CareerStateExtensionRecords } from '../../db/career-state'
import { documentDraftPolicy } from '../document-draft-policy'
import type { FieldErrors } from '../validation'
import {
  type Compensation,
  extensionObjectOrNull,
  type GenerationRules,
  type TruthfulnessRules,
  truthfulnessView,
} from './json-schemas'

/**
 * Structured input for the career data tabs (identity, experience, education).
 *
 * Every value arrives as a string from an HTMX form, so the schemas normalise
 * blank text to `undefined` and never invent values the author did not supply:
 * a date must match its declared precision exactly. Preserved extension fields
 * stay editable as ordinary `key = value` rows so no raw JSON is ever required.
 */

export const careerDatePrecisionSchema = z.enum(['day', 'month', 'year'])

/** Accepted textual shape for each precision. Nothing is padded or guessed. */
export const datePrecisionPlaceholder: Record<CareerDatePrecision, string> = {
  day: 'YYYY-MM-DD',
  month: 'YYYY-MM',
  year: 'YYYY',
}

const dateShape: Record<CareerDatePrecision, RegExp> = {
  day: /^\d{4}-\d{2}-\d{2}$/,
  month: /^\d{4}-\d{2}$/,
  year: /^\d{4}$/,
}

/**
 * Validates one date against its declared precision. A `day` value must be a
 * real calendar day, a `month` value a real month and a `year` value a bounded
 * year. Returns `null` when the value is usable.
 */
export function careerDateError(value: string, precision: CareerDatePrecision): string | null {
  if (!dateShape[precision].test(value)) {
    return `Use ${datePrecisionPlaceholder[precision]} (${precision} precision).`
  }
  const [yearText = '', monthText = '', dayText = ''] = value.split('-')
  const year = Number(yearText)
  if (year < 1900 || year > 2100) return 'Year must be between 1900 and 2100.'
  if (precision === 'year') return null
  const month = Number(monthText)
  if (month < 1 || month > 12) return 'Month must be between 01 and 12.'
  if (precision === 'month') return null
  const day = Number(dayText)
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  if (day < 1 || day > lastDay) return 'Day must be a real calendar day.'
  return null
}

const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value

const optionalText = (max: number) =>
  z.preprocess(emptyToUndefined, z.string().trim().max(max).optional())

const requiredLine = (label: string, max = 200) =>
  z.preprocess(
    (value) => (typeof value === 'string' ? value : ''),
    z
      .string()
      .trim()
      .min(1, `${label} is required.`)
      .max(max, `${label} must be ${max} characters or fewer.`),
  )

const optionalEmail = z.preprocess(
  emptyToUndefined,
  z.string().trim().max(320).pipe(z.email('Enter a valid email address.')).optional(),
)

/** Accepts blank, a bare host/path, or an http(s) URL; never `javascript:`. */
const optionalUrl = (label: string) =>
  z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .max(500)
      .refine(
        (value) => !value.includes(':') || /^https?:\/\//i.test(value),
        `Enter ${label} as an https:// address.`,
      )
      .optional(),
  )

const checkbox = z.preprocess(
  (value) => value === 'on' || value === 'true' || value === true,
  z.boolean(),
)

const optionalBoolean = z.preprocess(
  (value) => (value === 'yes' ? true : value === 'no' ? false : undefined),
  z.boolean().optional(),
)

const optionalInteger = (min: number, max: number, label: string) =>
  z.preprocess(
    (value) => {
      if (typeof value !== 'string') return value
      if (value.trim() === '') return undefined
      const parsed = Number(value)
      // A numeric string is coerced; anything else stays a string so the
      // failure names the field instead of reporting an anonymous NaN.
      return Number.isFinite(parsed) ? parsed : value
    },
    z
      .number({ error: `${label} must be a number.` })
      .int(`${label} must be a whole number.`)
      .min(min, `${label} must be at least ${min}.`)
      .max(max, `${label} must be at most ${max}.`)
      .optional(),
  )

const requiredInteger = (min: number, max: number, label: string) =>
  z.preprocess(
    (value) => {
      if (typeof value === 'number') return value
      if (typeof value !== 'string' || value.trim() === '') return undefined
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : undefined
    },
    z
      .number({ error: `${label} is required.` })
      .int(`${label} must be a whole number.`)
      .min(min, `${label} must be at least ${min}.`)
      .max(max, `${label} must be at most ${max}.`),
  )

const precisionField = z.preprocess(
  (value) => (typeof value === 'string' && value !== '' ? value : 'day'),
  careerDatePrecisionSchema,
)

/** The form revision written into every editable form so a stale submit conflicts. */
const revisionField = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() !== '' ? Number(value) : undefined),
  z.number().int().min(0).optional(),
)

/** Repeatable text controls are one entry per line; order is editorial data. */
export function parseLineList(value: string | null | undefined): string[] {
  return (value ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

/** Renders an ordered string array back into its editable one-per-line form. */
export function formatLineList(value: string[] | null | undefined): string {
  return (value ?? []).join('\n')
}

/**
 * Renders one preserved JSON value for an ordinary text control. Strings stay
 * verbatim unless they contain a newline, in which case they are JSON quoted so
 * a single line still describes them unambiguously.
 */
export function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' && !value.includes('\n')) return value
  return JSON.stringify(value) ?? ''
}

/**
 * Resolves an edited text control back to a stored value: blank clears it, an
 * untouched rendering keeps the original value (and its JSON type), and any
 * other text is stored as an ordinary string.
 */
export function resolveFieldValue(current: unknown, text: string | null | undefined): unknown {
  const trimmed = (text ?? '').trim()
  if (trimmed === '') return null
  if (formatFieldValue(current) === trimmed) return current
  return trimmed
}

function extensionEntries(value: unknown): Record<string, unknown> {
  return extensionObjectOrNull(value) ?? {}
}

/** Renders an extension field object as `key = value` lines. */
export function formatExtensionLines(value: unknown): string {
  return Object.entries(extensionEntries(value))
    .map(([key, entry]) => `${key} = ${formatFieldValue(entry)}`)
    .join('\n')
}

/** One non-empty line must be `key = value`; returns an error message or null. */
export function extensionLineError(text: string | null | undefined): string | null {
  for (const line of (text ?? '').split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    const separator = trimmed.indexOf('=')
    if (separator <= 0 || trimmed.slice(0, separator).trim() === '') {
      return 'Each extension field must be written as key = value, one per line.'
    }
  }
  return null
}

/**
 * Parses `key = value` lines back into an extension object. An unchanged value
 * keeps its original JSON value/type; new or edited values are stored as text.
 * Returns null when nothing remains, so removing a field really removes it.
 */
export function parseExtensionLines(
  current: unknown,
  text: string | null | undefined,
): Record<string, unknown> | null {
  const source = extensionEntries(current)
  const entries: Record<string, unknown> = {}
  for (const line of (text ?? '').split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    const separator = trimmed.indexOf('=')
    if (separator <= 0) continue
    const key = trimmed.slice(0, separator).trim()
    if (key === '') continue
    const raw = trimmed.slice(separator + 1).trim()
    entries[key] = raw !== '' && formatFieldValue(source[key]) === raw ? source[key] : raw
  }
  return Object.keys(entries).length > 0 ? entries : null
}

/**
 * Replaces one record's extension fields inside the database-owned extension
 * store, removing empty kinds so an empty edit leaves no residue.
 */
export function applyExtensionFields(
  records: CareerStateExtensionRecords,
  kind: string,
  key: string,
  value: Record<string, unknown> | null,
): CareerStateExtensionRecords {
  const next: CareerStateExtensionRecords = Object.fromEntries(
    Object.entries(records).map(([name, entries]) => [name, { ...entries }]),
  )
  const kindEntries = next[kind] ?? {}
  if (value && Object.keys(value).length > 0) kindEntries[key] = value
  else delete kindEntries[key]
  if (Object.keys(kindEntries).length > 0) next[kind] = kindEntries
  else delete next[kind]
  return next
}

function refineCareerDates(
  value: { startDate?: string; endDate?: string; datePrecision: CareerDatePrecision },
  ctx: z.RefinementCtx,
) {
  for (const [path, date] of [
    ['startDate', value.startDate],
    ['endDate', value.endDate],
  ] as const) {
    if (!date) continue
    const issue = careerDateError(date, value.datePrecision)
    if (issue) ctx.addIssue({ code: 'custom', path: [path], message: issue })
  }
}

export const candidateFormSchema = z
  .object({
    fullName: requiredLine('Full name'),
    email: optionalEmail,
    phone: optionalText(60),
    location: optionalText(200),
    website: optionalUrl('website'),
    linkedinUrl: optionalUrl('LinkedIn'),
    githubUrl: optionalUrl('GitHub'),
    workAuthorization: optionalText(300),
    requiresSponsorship: optionalBoolean,
    authorizationNotes: optionalText(2000),
    hasCareerBreak: z.preprocess(
      (value) => (value === 'yes' || value === 'no' ? value : ''),
      z.enum(['', 'yes', 'no']),
    ),
    careerBreakStartDate: optionalText(10),
    careerBreakEndDate: optionalText(10),
    careerBreakPrecision: precisionField,
    careerBreakReason: optionalText(2000),
    truthfulnessShape: z.preprocess(
      (value) => (value === 'rules' ? 'rules' : 'flags'),
      z.enum(['rules', 'flags']),
    ),
    neverClaimUnexperiencedSkill: checkbox,
    requireAccurateDates: checkbox,
    truthfulnessNotes: optionalText(2000),
    truthfulnessRules: optionalText(4000),
    extensionFields: optionalText(4000),
    expectedRevision: revisionField,
  })
  .superRefine((value, ctx) => {
    if (value.hasCareerBreak !== 'yes') {
      if (value.careerBreakStartDate || value.careerBreakEndDate || value.careerBreakReason) {
        ctx.addIssue({
          code: 'custom',
          path: ['hasCareerBreak'],
          message: 'Choose "Yes" before recording career break dates or a reason.',
        })
      }
      return
    }
    for (const [path, date] of [
      ['careerBreakStartDate', value.careerBreakStartDate],
      ['careerBreakEndDate', value.careerBreakEndDate],
    ] as const) {
      if (!date) continue
      const issue = careerDateError(date, value.careerBreakPrecision)
      if (issue) ctx.addIssue({ code: 'custom', path: [path], message: issue })
    }
  })

export const experienceFormSchema = z
  .object({
    company: requiredLine('Company'),
    role: requiredLine('Role'),
    employmentNature: optionalText(120),
    startDate: optionalText(10),
    endDate: optionalText(10),
    datePrecision: precisionField,
    displayDates: optionalText(120),
    sortOrder: optionalInteger(-10000, 10000, 'Sort order'),
    context: optionalText(4000),
    responsibilities: optionalText(6000),
    extensionFields: optionalText(4000),
    expectedRevision: revisionField,
  })
  .superRefine(refineCareerDates)

export const educationFormSchema = z
  .object({
    degree: requiredLine('Degree'),
    school: requiredLine('School'),
    startDate: optionalText(10),
    endDate: optionalText(10),
    datePrecision: precisionField,
    displayDates: optionalText(120),
    year: optionalInteger(1900, 2100, 'Year'),
    sortOrder: optionalInteger(-10000, 10000, 'Sort order'),
    coursework: optionalText(6000),
    details: optionalText(6000),
    extensionFields: optionalText(4000),
    expectedRevision: revisionField,
  })
  .superRefine(refineCareerDates)

/**
 * A `RelationPicker` submits one checkbox value per selected reference, so a
 * name can arrive as an array (multiple selections), a single string (one
 * selection) or a line-joined string (the re-rendered form after a 422/409).
 * All three normalise to the same ordered list.
 */
function pickerStrings(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter(Boolean)
  return typeof value === 'string' ? parseLineList(value) : []
}

/** External stable keys chosen in a picker (direction keys). */
const pickerKeyList = z.preprocess(pickerStrings, z.array(z.string().min(1).max(120)))

/** Internal ids chosen in a picker (catalog skills, publications). */
const pickerIdList = z.preprocess(
  (value) => pickerStrings(value).map(Number),
  z.array(z.number().int().positive('Choose a reference from the list.')),
)

/** An optional single picker (the experience a record belongs to). */
const optionalPickerId = z.preprocess((value) => {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : undefined
}, z.number().int().positive().optional())

/**
 * A required single picker (the approved catalog skill a personal skill uses).
 */
const requiredPickerId = z.preprocess((value) => {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : undefined
}, z.number({ error: 'Choose an approved catalog skill.' }).int().positive())

/**
 * Every URL line must be a real http(s) address, so an invalid source is an
 * inline 422 instead of a repository serialization error, and a `javascript:`
 * or other scheme can never be stored as a citable source.
 */
function refineHttpUrlLines(text: string | undefined, path: string, ctx: z.RefinementCtx): void {
  for (const [index, line] of parseLineList(text).entries()) {
    let usable = /^https?:\/\//i.test(line)
    if (usable) {
      try {
        new URL(line)
      } catch {
        usable = false
      }
    }
    if (!usable) {
      ctx.addIssue({
        code: 'custom',
        path: [path],
        message: `URL ${index + 1} must be a valid http:// or https:// address.`,
      })
    }
  }
}

/**
 * Achievement form: a claim with validated source links (experience, catalog
 * skills, directions, publications) kept separate from narrative attestation
 * (evidence notes and the candidate's own narrative).
 */
export const achievementFormSchema = z.object({
  claim: requiredLine('Claim', 500),
  experienceId: optionalPickerId,
  skills: pickerIdList,
  directions: pickerKeyList,
  publicationIds: pickerIdList,
  safeToUse: checkbox,
  evidence: optionalText(6000),
  evidenceNarratives: optionalText(6000),
  limitations: optionalText(6000),
  expectedRevision: revisionField,
})

/**
 * Project form. URLs are validated as http(s) here so an invalid address is an
 * inline 422 rather than a repository serialization error.
 */
export const projectFormSchema = z
  .object({
    name: requiredLine('Project name', 200),
    experienceId: optionalPickerId,
    ownership: optionalText(200),
    eligibility: z.preprocess(
      (value) => (value === 'not-eligible' ? 'not-eligible' : 'resume-eligible'),
      z.enum(['resume-eligible', 'not-eligible']),
    ),
    completion: optionalText(200),
    urls: optionalText(6000),
    safeWording: optionalText(2000),
    limitations: optionalText(6000),
    skills: pickerIdList,
    directions: pickerKeyList,
    expectedRevision: revisionField,
  })
  .superRefine((value, ctx) => {
    refineHttpUrlLines(value.urls, 'urls', ctx)
  })

/**
 * Publication author rows. The `RelationPicker`-style parallel inputs are one
 * `authorName` per row in display order plus one `authorCandidate` index per
 * checked row; exactly one author must be the candidate, so the authored claim
 * of authorship is never ambiguous.
 */
const publicationAuthorRowSchema = z.object({
  name: requiredLine('Author name'),
  isCandidate: z.boolean(),
})

export const publicationAuthorsSchema = z
  .array(publicationAuthorRowSchema)
  .min(1, 'Add at least one author.')
  .superRefine((rows, ctx) => {
    if (rows.filter((row) => row.isCandidate).length !== 1)
      ctx.addIssue({ code: 'custom', message: 'Mark exactly one author as the candidate.' })
  })

export type PublicationAuthorFormValues = z.infer<typeof publicationAuthorRowSchema>

/** Reads the parallel author inputs back into ordered author rows. */
export function parseAuthorRows(raw: Record<string, unknown>): PublicationAuthorFormValues[] {
  const list = (value: unknown): string[] =>
    value === undefined ? [] : Array.isArray(value) ? value.map(String) : [String(value)]
  const candidates = new Set(list(raw.authorCandidate).map((entry) => Number(entry)))
  return list(raw.authorName)
    .map((name, index) => ({ name: name.trim(), isCandidate: candidates.has(index) }))
    .filter((row) => row.name !== '')
}

/** Keeps the author rows a rejected submit carried so a 422 never loses edits. */
export function submittedAuthorValues(
  raw: Record<string, unknown>,
  fallback: PublicationAuthorFormValues[],
): PublicationAuthorFormValues[] {
  return raw.authorName === undefined ? fallback : parseAuthorRows(raw)
}

/**
 * Publication form. The authors are validated separately (they arrive as
 * parallel inputs), while the http(s)-only source URLs are checked here so an
 * unusable source is an inline 422.
 */
export const publicationFormSchema = z
  .object({
    title: requiredLine('Title', 300),
    citation: requiredLine('Citation', 1000),
    year: requiredInteger(1900, 2100, 'Year'),
    status: z.preprocess(
      (value) => (typeof value === 'string' && value !== '' ? value : 'needs-verification'),
      z.enum(['published', 'in-review', 'preprint', 'needs-verification']),
    ),
    safeToUse: checkbox,
    experienceId: optionalPickerId,
    authorListIsTruncated: checkbox,
    contributions: optionalText(6000),
    sourceUrls: optionalText(6000),
    projectIds: pickerIdList,
    directions: pickerKeyList,
    extensionFields: optionalText(4000),
    expectedRevision: revisionField,
  })
  .superRefine((value, ctx) => {
    refineHttpUrlLines(value.sourceUrls, 'sourceUrls', ctx)
  })

/** Portfolio topic form: title, status, order, project links, outline, details. */
export const portfolioTopicFormSchema = z.object({
  title: requiredLine('Topic title', 200),
  status: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() !== '' ? value : 'draft'),
    z.string().trim().max(80),
  ),
  sortOrder: optionalInteger(-10000, 10000, 'Sort order'),
  projectIds: pickerIdList,
  directions: pickerKeyList,
  outline: optionalText(6000),
  details: optionalText(6000),
  extensionFields: optionalText(4000),
  expectedRevision: revisionField,
})

/** Story form: the STAR narrative plus an experience link and directions. */
export const storyFormSchema = z.object({
  title: requiredLine('Story title', 200),
  experienceId: optionalPickerId,
  context: optionalText(4000),
  situation: optionalText(4000),
  task: optionalText(4000),
  action: optionalText(4000),
  result: optionalText(4000),
  narrative: optionalText(12000),
  directions: pickerKeyList,
  extensionFields: optionalText(4000),
  expectedRevision: revisionField,
})

/**
 * Career preferences singleton. Locations and work modes are repeatable text,
 * compensation keeps its currency/minimum/maximum/notes values (never a raw
 * JSON control), and blank controls clear the stored value.
 */
export const preferencesFormSchema = z.object({
  locations: optionalText(6000),
  workModes: optionalText(6000),
  availability: optionalText(600),
  compensationCurrency: optionalText(20),
  compensationMinimum: optionalInteger(0, 100_000_000, 'Compensation minimum'),
  compensationMaximum: optionalInteger(0, 100_000_000, 'Compensation maximum'),
  compensationNotes: optionalText(2000),
  notes: optionalText(6000),
  extensionFields: optionalText(4000),
  expectedRevision: revisionField,
})

/** Personal skill form: an approved catalog entry plus the candidate's own detail. */
export const personalSkillFormSchema = z.object({
  skillId: requiredPickerId,
  level: optionalText(80),
  resumeEligible: checkbox,
  explanation: optionalText(4000),
  notes: optionalText(4000),
  evidence: optionalText(6000),
  expectedRevision: revisionField,
})

/** One `section = words` line for a direction's per-section word budgets. */
const sectionBudgetLine = /^([A-Za-z][\w-]*)\s*=\s*(\d+)$/

/** Returns an error message when any non-empty line is not `section = words`. */
export function sectionBudgetLinesError(text: string | null | undefined): string | null {
  for (const line of (text ?? '').split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    const match = sectionBudgetLine.exec(trimmed)
    if (!match) return 'Each section budget must be written as section = words, one per line.'
    const words = Number(match[2])
    if (words < 1 || words > 5000)
      return 'Each section word budget must be between 1 and 5000 words.'
  }
  return null
}

export function formatSectionBudgets(value: Record<string, number> | null | undefined): string {
  return Object.entries(value ?? {})
    .map(([section, words]) => `${section} = ${words}`)
    .join('\n')
}

export function parseSectionBudgets(text: string | null | undefined): Record<string, number> {
  const budgets: Record<string, number> = {}
  for (const line of (text ?? '').split('\n')) {
    const match = sectionBudgetLine.exec(line.trim())
    if (match) budgets[match[1] ?? ''] = Number(match[2])
  }
  return budgets
}

/**
 * Direction form: stable identity plus ordinary controls for the bounded
 * generation rules. Target titles are repeatable editorial lines, and the
 * word/bullet budgets are numbers seeded from `documentDraftPolicy` so a saved
 * direction keeps the current drafting behaviour.
 */
export const directionFormSchema = z
  .object({
    label: requiredLine('Direction label', 120),
    targetTitles: optionalText(4000),
    sortOrder: optionalInteger(-10000, 10000, 'Sort order'),
    maxWords: optionalInteger(1, 5000, 'Maximum words'),
    maxBullets: optionalInteger(0, 500, 'Maximum bullets'),
    summaryMaxWords: optionalInteger(1, 1000, 'Summary maximum words'),
    sectionWordBudgets: optionalText(4000),
    expectedRevision: revisionField,
  })
  .superRefine((value, ctx) => {
    if (parseLineList(value.targetTitles).length === 0)
      ctx.addIssue({
        code: 'custom',
        path: ['targetTitles'],
        message: 'Add at least one target title.',
      })
    const budgetError = sectionBudgetLinesError(value.sectionWordBudgets)
    if (budgetError)
      ctx.addIssue({ code: 'custom', path: ['sectionWordBudgets'], message: budgetError })
  })

/**
 * Base Resume draft form. A version is immutable once created: this form only
 * ever creates a new draft, and a version label that already exists is refused
 * by the repository instead of overwriting the stored Markdown.
 */
export const baseResumeDraftFormSchema = z.object({
  directionKey: requiredLine('Direction', 80),
  version: requiredLine('Version', 100),
  markdown: z.preprocess(
    (value) => (typeof value === 'string' ? value : ''),
    z
      .string()
      .trim()
      .min(1, 'Enter the Base Resume Markdown.')
      .max(200_000, 'Base Resume Markdown must be 200000 characters or fewer.'),
  ),
})

export type DirectionFormValues = z.infer<typeof directionFormSchema>
export type BaseResumeDraftFormValues = z.infer<typeof baseResumeDraftFormSchema>

export type CandidateFormValues = z.infer<typeof candidateFormSchema>
export type ExperienceFormValues = z.infer<typeof experienceFormSchema>
export type EducationFormValues = z.infer<typeof educationFormSchema>
export type AchievementFormValues = z.infer<typeof achievementFormSchema>
export type ProjectFormValues = z.infer<typeof projectFormSchema>
export type PersonalSkillFormValues = z.infer<typeof personalSkillFormSchema>
export type StoryFormValues = z.infer<typeof storyFormSchema>
export type PublicationFormValues = z.infer<typeof publicationFormSchema>
export type PortfolioTopicFormValues = z.infer<typeof portfolioTopicFormSchema>
export type PreferencesFormValues = z.infer<typeof preferencesFormSchema>

/**
 * Rebuilds the truthfulness value in the shape the record already used. A rules
 * list stays a list; the flag object stays an object; an empty result is null so
 * clearing the field does not invent an empty rule.
 */
function truthfulnessInput(values: CandidateFormValues): TruthfulnessRules | null {
  if (values.truthfulnessShape === 'rules') {
    const rules = (values.truthfulnessRules ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    return rules.length > 0 ? rules : null
  }
  const flags = {
    neverClaimUnexperiencedSkill: values.neverClaimUnexperiencedSkill,
    requireAccurateDates: values.requireAccurateDates,
    notes: values.truthfulnessNotes ?? null,
  }
  const hasFlag =
    flags.neverClaimUnexperiencedSkill === true ||
    flags.requireAccurateDates === true ||
    (flags.notes !== null && flags.notes !== '')
  return hasFlag ? flags : null
}

export function candidateInput(values: CandidateFormValues): CareerCandidateInput {
  const authorization = {
    workAuthorization: values.workAuthorization ?? null,
    requiresSponsorship: values.requiresSponsorship ?? null,
    notes: values.authorizationNotes ?? null,
  }
  const hasAuthorization = Object.values(authorization).some((entry) => entry !== null)
  return {
    fullName: values.fullName,
    email: values.email ?? null,
    phone: values.phone ?? null,
    location: values.location ?? null,
    website: values.website ?? null,
    linkedinUrl: values.linkedinUrl ?? null,
    githubUrl: values.githubUrl ?? null,
    authorization: hasAuthorization ? authorization : null,
    careerBreak:
      values.hasCareerBreak === ''
        ? null
        : {
            hasBreak: values.hasCareerBreak === 'yes',
            startDate:
              values.hasCareerBreak === 'yes' ? (values.careerBreakStartDate ?? null) : null,
            endDate: values.hasCareerBreak === 'yes' ? (values.careerBreakEndDate ?? null) : null,
            datePrecision: values.careerBreakPrecision,
            reason: values.hasCareerBreak === 'yes' ? (values.careerBreakReason ?? null) : null,
          },
    truthfulness: truthfulnessInput(values),
  }
}

export function experienceInput(
  values: ExperienceFormValues,
  options: { stableKey: string; extension: Record<string, unknown> | null },
): CareerExperienceInput {
  return {
    stableKey: options.stableKey,
    company: values.company,
    role: values.role,
    employmentNature: values.employmentNature ?? null,
    startDate: values.startDate ?? null,
    endDate: values.endDate ?? null,
    datePrecision: values.datePrecision,
    displayDates: values.displayDates ?? null,
    sortOrder: values.sortOrder ?? 0,
    context: values.context ?? null,
    responsibilities: parseLineList(values.responsibilities),
    extension: options.extension,
  }
}

export function educationInput(
  values: EducationFormValues,
  options: { stableKey: string; details: unknown },
): CareerEducationInput {
  return {
    stableKey: options.stableKey,
    degree: values.degree,
    school: values.school,
    startDate: values.startDate ?? null,
    endDate: values.endDate ?? null,
    datePrecision: values.datePrecision,
    displayDates: values.displayDates ?? null,
    year: values.year ?? null,
    sortOrder: values.sortOrder ?? 0,
    coursework: parseLineList(values.coursework),
    details: options.details,
  }
}

export function achievementInput(
  values: AchievementFormValues,
  options: { stableKey: string },
): CareerAchievementInput {
  return {
    stableKey: options.stableKey,
    experienceId: values.experienceId ?? null,
    claim: values.claim,
    safeToUse: values.safeToUse,
    evidence: parseLineList(values.evidence),
    evidenceNarratives: parseLineList(values.evidenceNarratives),
    limitations: parseLineList(values.limitations),
    skills: values.skills,
    directions: values.directions,
    publicationIds: values.publicationIds,
  }
}

export function projectInput(
  values: ProjectFormValues,
  options: { stableKey: string },
): CareerProjectInput {
  return {
    stableKey: options.stableKey,
    name: values.name,
    experienceId: values.experienceId ?? null,
    ownership: values.ownership ?? null,
    eligibility: values.eligibility,
    completion: values.completion ?? null,
    urls: parseLineList(values.urls),
    safeWording: values.safeWording ?? null,
    limitations: parseLineList(values.limitations),
    skills: values.skills,
    directions: values.directions,
  }
}

export function personalSkillInput(values: PersonalSkillFormValues): CareerSkillInput {
  return {
    skillId: values.skillId,
    level: values.level ?? null,
    resumeEligible: values.resumeEligible,
    explanation: values.explanation ?? null,
    notes: values.notes ?? null,
    evidence: parseLineList(values.evidence),
  }
}

/**
 * A personal skill's catalog entry is its identity and cannot be changed, so an
 * update never carries `skillId`; the submitted one is ignored.
 */
export function personalSkillUpdateInput(values: PersonalSkillFormValues): CareerSkillUpdateInput {
  return {
    level: values.level ?? null,
    resumeEligible: values.resumeEligible,
    explanation: values.explanation ?? null,
    notes: values.notes ?? null,
    evidence: parseLineList(values.evidence),
  }
}

export function storyInput(
  values: StoryFormValues,
  options: { stableKey: string },
): CareerStoryInput {
  return {
    stableKey: options.stableKey,
    experienceId: values.experienceId ?? null,
    title: values.title,
    context: values.context ?? null,
    situation: values.situation ?? null,
    task: values.task ?? null,
    action: values.action ?? null,
    result: values.result ?? null,
    narrative: values.narrative ?? null,
    directions: values.directions,
  }
}

/** The authors are validated separately; everything else comes from the schema. */
export function publicationInput(
  values: PublicationFormValues,
  options: { stableKey: string; authors: PublicationAuthorFormValues[] },
): CareerPublicationInput {
  return {
    stableKey: options.stableKey,
    title: values.title,
    citation: values.citation,
    year: values.year,
    status: values.status as CareerPublicationStatus,
    safeToUse: values.safeToUse,
    experienceId: values.experienceId ?? null,
    authors: options.authors,
    authorListTruncated: values.authorListIsTruncated,
    contributions: parseLineList(values.contributions),
    sourceUrls: parseLineList(values.sourceUrls),
    projectIds: values.projectIds,
    directions: values.directions,
  }
}

export function portfolioTopicInput(
  values: PortfolioTopicFormValues,
  options: { stableKey: string; details: unknown },
): CareerPortfolioTopicInput {
  return {
    stableKey: options.stableKey,
    title: values.title,
    status: values.status,
    sortOrder: values.sortOrder ?? 0,
    outline: parseLineList(values.outline),
    details: options.details,
    projectIds: values.projectIds,
    directions: values.directions,
  }
}

/**
 * Builds the preferences input. Known compensation controls overwrite their
 * value (blank clears it) while unknown preserved compensation keys stay, so a
 * save never silently drops an imported field.
 */
export function preferencesInput(
  values: PreferencesFormValues,
  options: { compensation?: Compensation | null } = {},
): CareerPreferencesInput {
  const compensation: Record<string, unknown> = { ...(options.compensation ?? {}) }
  const known: Array<[string, string | number | undefined]> = [
    ['currency', values.compensationCurrency],
    ['minimum', values.compensationMinimum],
    ['maximum', values.compensationMaximum],
    ['notes', values.compensationNotes],
  ]
  for (const [key, value] of known) {
    if (value === undefined || value === '') delete compensation[key]
    else compensation[key] = value
  }
  return {
    locations: parseLineList(values.locations),
    workModes: parseLineList(values.workModes),
    availability: values.availability ?? null,
    compensation: Object.keys(compensation).length > 0 ? compensation : null,
    notes: values.notes ?? null,
  }
}

function checkboxValue(value: boolean | undefined): string {
  return value ? 'on' : ''
}

/**
 * Builds a direction's stored generation rules from its form. Known budgets
 * overwrite their stored value (a blank control falls back to the documented
 * default) while any unknown preserved rule key stays, so an imported rule is
 * never silently dropped.
 */
export function directionRulesFromForm(
  values: DirectionFormValues,
  current?: GenerationRules | null,
): GenerationRules {
  const rules: GenerationRules = { ...(current ?? {}) }
  const setBudget = (
    key: 'maxWords' | 'maxBullets' | 'summaryMaxWords',
    value: number | undefined,
  ) => {
    if (value === undefined) delete rules[key]
    else rules[key] = value
  }
  setBudget('maxWords', values.maxWords)
  setBudget('maxBullets', values.maxBullets)
  setBudget('summaryMaxWords', values.summaryMaxWords)
  const sectionBudgets = parseSectionBudgets(values.sectionWordBudgets)
  if (Object.keys(sectionBudgets).length > 0) rules.sectionWordBudgets = sectionBudgets
  else delete rules.sectionWordBudgets
  return rules
}

export function directionInput(
  values: DirectionFormValues,
  options: { key: string; currentRules?: GenerationRules | null },
): CareerDirectionInput & CareerDirectionUpdateInput {
  return {
    key: options.key,
    label: values.label,
    targetTitles: parseLineList(values.targetTitles),
    rules: directionRulesFromForm(values, options.currentRules),
    sortOrder: values.sortOrder ?? 0,
  }
}

export function candidateFormValues(
  candidate: (CareerCandidateInput & { revision?: number }) | null,
  extensions: unknown,
): Record<string, string> {
  const truthfulness = truthfulnessView(candidate?.truthfulness)
  return {
    fullName: candidate?.fullName ?? '',
    email: candidate?.email ?? '',
    phone: candidate?.phone ?? '',
    location: candidate?.location ?? '',
    website: candidate?.website ?? '',
    linkedinUrl: candidate?.linkedinUrl ?? '',
    githubUrl: candidate?.githubUrl ?? '',
    workAuthorization: candidate?.authorization?.workAuthorization ?? '',
    requiresSponsorship:
      candidate?.authorization?.requiresSponsorship === true
        ? 'yes'
        : candidate?.authorization?.requiresSponsorship === false
          ? 'no'
          : '',
    authorizationNotes: candidate?.authorization?.notes ?? '',
    hasCareerBreak:
      candidate?.careerBreak === null || candidate?.careerBreak === undefined
        ? ''
        : candidate.careerBreak.hasBreak
          ? 'yes'
          : 'no',
    careerBreakStartDate: candidate?.careerBreak?.startDate ?? '',
    careerBreakEndDate: candidate?.careerBreak?.endDate ?? '',
    careerBreakPrecision: candidate?.careerBreak?.datePrecision ?? 'day',
    careerBreakReason: candidate?.careerBreak?.reason ?? '',
    truthfulnessShape: truthfulness.shape,
    neverClaimUnexperiencedSkill: checkboxValue(truthfulness.flags?.neverClaimUnexperiencedSkill),
    requireAccurateDates: checkboxValue(truthfulness.flags?.requireAccurateDates),
    truthfulnessNotes: truthfulness.flags?.notes ?? '',
    truthfulnessRules: truthfulness.rules.join('\n'),
    extensionFields: formatExtensionLines(extensions),
    expectedRevision: String(candidate?.revision ?? 0),
  }
}

/** An editorial record as it is edited, independent of its repository record type. */
export type ExperienceFormSource = {
  company?: string
  role?: string
  employmentNature?: string | null
  startDate?: string | null
  endDate?: string | null
  datePrecision?: string | null
  displayDates?: string | null
  sortOrder?: number
  context?: string | null
  responsibilities?: string[]
  revision?: number
}

export type EducationFormSource = {
  degree?: string
  school?: string
  startDate?: string | null
  endDate?: string | null
  datePrecision?: string | null
  displayDates?: string | null
  year?: number | null
  sortOrder?: number
  coursework?: string[]
  revision?: number
}

/** Stored precision text normalised to the only usable values. */
function asPrecision(value: string | null | undefined): CareerDatePrecision {
  return value === 'month' || value === 'year' ? value : 'day'
}

export function experienceFormValues(
  record: ExperienceFormSource | null,
  extension: unknown,
): Record<string, string> {
  return {
    company: record?.company ?? '',
    role: record?.role ?? '',
    employmentNature: record?.employmentNature ?? '',
    startDate: record?.startDate ?? '',
    endDate: record?.endDate ?? '',
    datePrecision: asPrecision(record?.datePrecision),
    displayDates: record?.displayDates ?? '',
    sortOrder: record?.sortOrder === undefined ? '0' : String(record.sortOrder),
    context: record?.context ?? '',
    responsibilities: formatLineList(record?.responsibilities),
    extensionFields: formatExtensionLines(extension),
    expectedRevision: String(record?.revision ?? 0),
  }
}

export function educationFormValues(
  record: EducationFormSource | null,
  details: unknown,
  extensions: unknown,
): Record<string, string> {
  return {
    degree: record?.degree ?? '',
    school: record?.school ?? '',
    startDate: record?.startDate ?? '',
    endDate: record?.endDate ?? '',
    datePrecision: asPrecision(record?.datePrecision),
    displayDates: record?.displayDates ?? '',
    year: record?.year === undefined || record?.year === null ? '' : String(record.year),
    sortOrder: record?.sortOrder === undefined ? '0' : String(record.sortOrder),
    coursework: formatLineList(record?.coursework),
    details: formatFieldValue(details),
    extensionFields: formatExtensionLines(extensions),
    expectedRevision: String(record?.revision ?? 0),
  }
}

/** One line per selected reference, the editable shape a `RelationPicker` reads. */
export function pickerSelection(values: Array<number | string> | null | undefined): string {
  return (values ?? []).map(String).join('\n')
}

export type AchievementFormSource = {
  claim?: string
  experienceId?: number | null
  skills?: number[]
  directions?: string[]
  publicationIds?: number[]
  safeToUse?: boolean
  evidence?: string[]
  evidenceNarratives?: string[]
  limitations?: string[]
  revision?: number
}

export type ProjectFormSource = {
  name?: string
  experienceId?: number | null
  ownership?: string | null
  eligibility?: string | null
  completion?: string | null
  urls?: string[]
  safeWording?: string | null
  limitations?: string[]
  skills?: number[]
  directions?: string[]
  revision?: number
}

export type PersonalSkillFormSource = {
  skillId?: number
  level?: string | null
  resumeEligible?: boolean
  explanation?: string | null
  notes?: string | null
  evidence?: string[]
  revision?: number
}

export function achievementFormValues(
  record: AchievementFormSource | null,
): Record<string, string> {
  return {
    claim: record?.claim ?? '',
    experienceId:
      record?.experienceId === null || record?.experienceId === undefined
        ? ''
        : String(record.experienceId),
    skills: pickerSelection(record?.skills),
    directions: pickerSelection(record?.directions),
    publicationIds: pickerSelection(record?.publicationIds),
    safeToUse: record === null || record.safeToUse !== false ? 'on' : '',
    evidence: formatLineList(record?.evidence),
    evidenceNarratives: formatLineList(record?.evidenceNarratives),
    limitations: formatLineList(record?.limitations),
    expectedRevision: String(record?.revision ?? 0),
  }
}

export function projectFormValues(record: ProjectFormSource | null): Record<string, string> {
  return {
    name: record?.name ?? '',
    experienceId:
      record?.experienceId === null || record?.experienceId === undefined
        ? ''
        : String(record.experienceId),
    ownership: record?.ownership ?? '',
    eligibility: record?.eligibility === 'not-eligible' ? 'not-eligible' : 'resume-eligible',
    completion: record?.completion ?? '',
    urls: formatLineList(record?.urls),
    safeWording: record?.safeWording ?? '',
    limitations: formatLineList(record?.limitations),
    skills: pickerSelection(record?.skills),
    directions: pickerSelection(record?.directions),
    expectedRevision: String(record?.revision ?? 0),
  }
}

export function personalSkillFormValues(
  record: PersonalSkillFormSource | null,
): Record<string, string> {
  return {
    skillId: record?.skillId === undefined ? '' : String(record.skillId),
    level: record?.level ?? '',
    resumeEligible: record === null || record.resumeEligible !== false ? 'on' : '',
    explanation: record?.explanation ?? '',
    notes: record?.notes ?? '',
    evidence: formatLineList(record?.evidence),
    expectedRevision: String(record?.revision ?? 0),
  }
}

export type StoryFormSource = {
  title?: string
  experienceId?: number | null
  context?: string | null
  situation?: string | null
  task?: string | null
  action?: string | null
  result?: string | null
  narrative?: string | null
  directions?: string[]
  extension?: unknown
  revision?: number
}

export type PublicationFormSource = {
  title?: string
  citation?: string
  year?: number
  status?: string | null
  safeToUse?: boolean
  experienceId?: number | null
  authors?: Array<{ name: string; isCandidate: boolean }>
  authorListTruncated?: boolean
  contributions?: string[]
  sourceUrls?: string[]
  projectIds?: number[]
  directions?: string[]
  revision?: number
}

export type PortfolioTopicFormSource = {
  title?: string
  status?: string | null
  sortOrder?: number
  outline?: string[]
  details?: unknown
  projectIds?: number[]
  directions?: string[]
  revision?: number
}

export type PreferencesFormSource = {
  locations?: string[]
  workModes?: string[]
  availability?: string | null
  compensation?: Compensation | null
  notes?: string | null
  revision?: number
}

const PUBLICATION_STATUSES = ['published', 'in-review', 'preprint', 'needs-verification'] as const

/** Only the four stored statuses are selectable; anything else is unverified. */
function asPublicationStatus(value: string | null | undefined): CareerPublicationStatus {
  return (PUBLICATION_STATUSES as readonly string[]).includes(value ?? '')
    ? (value as CareerPublicationStatus)
    : 'needs-verification'
}

export function storyFormValues(
  record: StoryFormSource | null,
  extensions: unknown,
): Record<string, string> {
  return {
    title: record?.title ?? '',
    experienceId:
      record?.experienceId === null || record?.experienceId === undefined
        ? ''
        : String(record.experienceId),
    context: record?.context ?? '',
    situation: record?.situation ?? '',
    task: record?.task ?? '',
    action: record?.action ?? '',
    result: record?.result ?? '',
    narrative: record?.narrative ?? '',
    directions: pickerSelection(record?.directions),
    extensionFields: formatExtensionLines(extensions),
    expectedRevision: String(record?.revision ?? 0),
  }
}

export function publicationFormValues(
  record: PublicationFormSource | null,
  extensions: unknown,
): Record<string, string> {
  return {
    title: record?.title ?? '',
    citation: record?.citation ?? '',
    year: record?.year === undefined ? '' : String(record.year),
    status: asPublicationStatus(record?.status),
    safeToUse: record === null || record.safeToUse !== false ? 'on' : '',
    experienceId:
      record?.experienceId === null || record?.experienceId === undefined
        ? ''
        : String(record.experienceId),
    authorListIsTruncated: record?.authorListTruncated ? 'on' : '',
    contributions: formatLineList(record?.contributions),
    sourceUrls: formatLineList(record?.sourceUrls),
    projectIds: pickerSelection(record?.projectIds),
    directions: pickerSelection(record?.directions),
    extensionFields: formatExtensionLines(extensions),
    expectedRevision: String(record?.revision ?? 0),
  }
}

/** Ordered author rows as the author editor renders them. */
export function publicationAuthorValues(
  record: PublicationFormSource | null,
): PublicationAuthorFormValues[] {
  return (record?.authors ?? []).map((author) => ({
    name: author.name,
    isCandidate: author.isCandidate,
  }))
}

export type PublicationFormParse =
  | { success: true; values: PublicationFormValues; authors: PublicationAuthorFormValues[] }
  | { success: false; errors: FieldErrors }

/**
 * Validates a publication form together with its separately-encoded authors, so
 * a missing or duplicated candidate author is reported as an inline error on the
 * author control rather than a repository failure.
 */
export function parsePublicationForm(raw: Record<string, unknown>): PublicationFormParse {
  const parsed = publicationFormSchema.safeParse(raw)
  const authors = publicationAuthorsSchema.safeParse(parseAuthorRows(raw))
  if (parsed.success && authors.success)
    return { success: true, values: parsed.data, authors: authors.data }
  const errors: FieldErrors = parsed.success ? {} : parsed.error.flatten().fieldErrors
  if (!authors.success) errors.authors = authors.error.issues.map((issue) => issue.message)
  return { success: false, errors }
}

export function portfolioTopicFormValues(
  record: PortfolioTopicFormSource | null,
  extensions: unknown,
): Record<string, string> {
  return {
    title: record?.title ?? '',
    status: record?.status ?? 'draft',
    sortOrder: record?.sortOrder === undefined ? '0' : String(record.sortOrder),
    outline: formatLineList(record?.outline),
    details: formatFieldValue(record?.details),
    projectIds: pickerSelection(record?.projectIds),
    directions: pickerSelection(record?.directions),
    extensionFields: formatExtensionLines(extensions),
    expectedRevision: String(record?.revision ?? 0),
  }
}

export function preferencesFormValues(
  record: PreferencesFormSource | null,
  extensions: unknown,
): Record<string, string> {
  const number = (value: number | null | undefined) =>
    value === null || value === undefined ? '' : String(value)
  return {
    locations: formatLineList(record?.locations),
    workModes: formatLineList(record?.workModes),
    availability: record?.availability ?? '',
    compensationCurrency: record?.compensation?.currency ?? '',
    compensationMinimum: number(record?.compensation?.minimum),
    compensationMaximum: number(record?.compensation?.maximum),
    compensationNotes: record?.compensation?.notes ?? '',
    notes: record?.notes ?? '',
    extensionFields: formatExtensionLines(extensions),
    expectedRevision: String(record?.revision ?? 0),
  }
}

/** A direction as it is edited, with its stored rules rendered as ordinary controls. */
export type DirectionFormSource = {
  key?: string
  label?: string
  targetTitles?: string[]
  rules?: GenerationRules | null
  sortOrder?: number
  revision?: number
}

/**
 * Renders a direction for editing. A new direction starts from the documented
 * default budgets, so an explicitly saved direction keeps today's behaviour
 * while a legacy direction without stored rules still falls back to them.
 */
export function directionFormValues(record: DirectionFormSource | null): Record<string, string> {
  const rules = record?.rules ?? null
  const budget = (value: number | undefined, fallback: number) => String(value ?? fallback)
  return {
    label: record?.label ?? '',
    targetTitles: formatLineList(record?.targetTitles),
    sortOrder: String(record?.sortOrder ?? 0),
    maxWords: budget(rules?.maxWords, documentDraftPolicy.resume.maxWords),
    maxBullets: budget(rules?.maxBullets, documentDraftPolicy.resume.maxBullets),
    summaryMaxWords: budget(rules?.summaryMaxWords, documentDraftPolicy.resume.summaryMaxWords),
    sectionWordBudgets: formatSectionBudgets(rules?.sectionWordBudgets),
    expectedRevision: String(record?.revision ?? 0),
  }
}

/**
 * Renders a Base Resume draft control. `source` copies an existing version into
 * a new draft; it never edits the stored version.
 */
export function baseResumeDraftFormValues(
  source: { directionKey?: string; markdown?: string } | null = null,
  options: { directionKey?: string } = {},
): Record<string, string> {
  return {
    directionKey: source?.directionKey ?? options.directionKey ?? '',
    version: '',
    markdown: source?.markdown ?? '',
  }
}

/** Merges a submitted form back over its previous values, so a 422 keeps edits. */
export function submittedValues(
  raw: Record<string, unknown>,
  fallback: Record<string, string>,
): Record<string, string> {
  const submitted: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    submitted[key] = Array.isArray(value)
      ? value.map(String).join('\n')
      : typeof value === 'string'
        ? value
        : ''
  }
  return { ...fallback, ...submitted }
}

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Builds a readable stable key for a new record and guarantees uniqueness within
 * `existing`. Keys are generated, never typed by ordinary users, and never
 * change afterwards, so a later rename keeps the external identity.
 */
export function careerStableKey(
  parts: Array<string | null | undefined>,
  existing: Iterable<string>,
): string {
  const taken = new Set(existing)
  const base =
    parts
      .map((part) => slugify(part ?? ''))
      .filter(Boolean)
      .join('-')
      .slice(0, 80)
      .replace(/-+$/g, '') || 'record'
  let candidate = base
  let suffix = 2
  while (taken.has(candidate)) {
    candidate = `${base}-${suffix}`
    suffix += 1
  }
  return candidate
}
