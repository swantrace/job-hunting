import { z } from 'zod'
import type { CareerCandidateInput } from '../../db/career-facts'
import type {
  CareerDatePrecision,
  CareerEducationInput,
  CareerExperienceInput,
} from '../../db/career-records'
import type { CareerStateExtensionRecords } from '../../db/career-state'
import { extensionObjectOrNull } from './json-schemas'

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
    emptyToUndefined,
    z.coerce
      .number()
      .int(`${label} must be a whole number.`)
      .min(min, `${label} must be at least ${min}.`)
      .max(max, `${label} must be at most ${max}.`)
      .optional(),
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
    neverClaimUnexperiencedSkill: checkbox,
    requireAccurateDates: checkbox,
    truthfulnessNotes: optionalText(2000),
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

export type CandidateFormValues = z.infer<typeof candidateFormSchema>
export type ExperienceFormValues = z.infer<typeof experienceFormSchema>
export type EducationFormValues = z.infer<typeof educationFormSchema>

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
    truthfulness: {
      neverClaimUnexperiencedSkill: values.neverClaimUnexperiencedSkill,
      requireAccurateDates: values.requireAccurateDates,
      notes: values.truthfulnessNotes ?? null,
    },
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

function checkboxValue(value: boolean | undefined): string {
  return value ? 'on' : ''
}

export function candidateFormValues(
  candidate: (CareerCandidateInput & { revision?: number }) | null,
  extensions: unknown,
): Record<string, string> {
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
    neverClaimUnexperiencedSkill: checkboxValue(
      candidate?.truthfulness?.neverClaimUnexperiencedSkill,
    ),
    requireAccurateDates: checkboxValue(candidate?.truthfulness?.requireAccurateDates),
    truthfulnessNotes: candidate?.truthfulness?.notes ?? '',
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

/** Merges a submitted form back over its previous values, so a 422 keeps edits. */
export function submittedValues(
  raw: Record<string, unknown>,
  fallback: Record<string, string>,
): Record<string, string> {
  const submitted: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    submitted[key] = typeof value === 'string' ? value : ''
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
