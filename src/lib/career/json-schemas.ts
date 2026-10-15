import { z } from 'zod'

/**
 * Loose runtime validation for the JSON TEXT columns introduced by migration
 * `0026_career_facts.sql`. Drizzle `.$type` gives compile-time types only, so
 * every JSON column is validated here on read and write.
 *
 * Every object schema is deliberately loose: authored extension fields that the
 * current UI does not understand must survive a parse -> serialize round trip.
 * A schema never strips keys, and a malformed value raises a clear error instead
 * of silently resetting the preserved data.
 */

/** Any JSON value, for editorial detail columns whose shape is free-form. */
export const jsonValueSchema = z.unknown()

/** A loose JSON object, for extension metadata and legacy versioned documents. */
export const extensionSchema = z.looseObject({})

export const authorizationSchema = z.looseObject({
  workAuthorization: z.string().nullable().optional(),
  requiresSponsorship: z.boolean().nullable().optional(),
  notes: z.string().nullable().optional(),
})

export const careerBreakSchema = z.looseObject({
  hasBreak: z.boolean().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  datePrecision: z.enum(['day', 'month', 'year']).optional(),
  reason: z.string().nullable().optional(),
})

/**
 * Truthfulness rules are a bounded rules collection, and real career data
 * expresses them either as a loose object of named flags or as an ordered list
 * of rule statements. Both forms are preserved verbatim: the plan requires every
 * original fact and extension field to survive import, and narrowing this to one
 * shape would silently reject the other.
 */
export const truthfulnessSchema = z.union([
  z.looseObject({
    neverClaimUnexperiencedSkill: z.boolean().optional(),
    requireAccurateDates: z.boolean().optional(),
    notes: z.string().nullable().optional(),
  }),
  z.array(z.string().trim().min(1)).max(100),
])

/**
 * Ordered string collections: coursework, responsibilities, evidence,
 * evidence narratives, limitations, contributions, outlines, locations and
 * work modes. Order is editorial data and is preserved.
 */
export const stringListSchema = z.array(z.string())

/** Ordered publication authors; the candidate must be identifiable by index. */
export const authorsSchema = z.array(z.looseObject({ name: z.string(), isCandidate: z.boolean() }))

const httpUrlSchema = z.url({ protocol: /^https?$/, normalize: false })

/** Project/portfolio URLs. Only http(s) is a citable public source. */
export const urlListSchema = z.array(httpUrlSchema)

/** Publication source URLs; same http(s) restriction as project URLs. */
export const sourceUrlsSchema = z.array(httpUrlSchema)

/**
 * Requirement-owned source occurrences. `source`/`provenance` are required so a
 * mention always says where it came from; `context`, `confidence` and the
 * unresolved `conflict` candidates are optional.
 */
export const occurrencesSchema = z.array(
  z.looseObject({
    source: z.string(),
    provenance: z.string(),
    context: z.string().nullable().optional(),
    confidence: z.number().nullable().optional(),
    conflict: z
      .array(z.looseObject({ skillId: z.number(), confidence: z.number().nullable().optional() }))
      .optional(),
  }),
)

/** Target titles for a direction; a direction without a target title is unusable. */
export const targetTitlesSchema = z.array(z.string().trim().min(1)).min(1)

const boundedBudget = (minimum: number, maximum: number) =>
  z.number().int().min(minimum).max(maximum)

/**
 * Bounded generation preferences for a direction. Budgets are capped so a
 * stored rule can never ask drafting or deterministic validation for an
 * unbounded document.
 */
export const generationRulesSchema = z.looseObject({
  maxWords: boundedBudget(1, 5000).optional(),
  maxBullets: boundedBudget(0, 500).optional(),
  summaryMaxWords: boundedBudget(1, 1000).optional(),
  sectionWordBudgets: z.record(z.string(), boundedBudget(1, 5000)).optional(),
})

export const compensationSchema = z.looseObject({
  currency: z.string().nullable().optional(),
  minimum: z.number().nullable().optional(),
  maximum: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
})

export type Authorization = z.infer<typeof authorizationSchema>
export type CareerBreak = z.infer<typeof careerBreakSchema>
export type TruthfulnessRules = z.infer<typeof truthfulnessSchema>

/** Either supported truthfulness shape, still in its original form. */
export type TruthfulnessView = {
  shape: 'rules' | 'flags'
  rules: string[]
  flags: {
    neverClaimUnexperiencedSkill?: boolean
    requireAccurateDates?: boolean
    notes?: string | null
  } | null
}

/**
 * Reads either truthfulness shape for display and editing. The editor keeps the
 * stored shape: a rules list stays a list, an object stays an object, so saving
 * an untouched record never rewrites the author's chosen form.
 */
export function truthfulnessView(value: TruthfulnessRules | null | undefined): TruthfulnessView {
  if (Array.isArray(value)) return { shape: 'rules', rules: value, flags: null }
  return { shape: 'flags', rules: [], flags: value ?? null }
}
export type PublicationAuthor = z.infer<typeof authorsSchema>[number]
export type SourceOccurrence = z.infer<typeof occurrencesSchema>[number]
export type GenerationRules = z.infer<typeof generationRulesSchema>
export type Compensation = z.infer<typeof compensationSchema>

/**
 * Parses a JSON TEXT column. NULL, empty and whitespace-only values return the
 * supplied fallback (the "nothing stored yet" case). Malformed or shape-invalid
 * JSON throws an error naming `column`, so a corrupt value is surfaced and never
 * silently replaced or dropped.
 */
export function parseJsonColumn<T>(
  json: string | null | undefined,
  schema: z.ZodType<T>,
  fallback: T,
  column = 'JSON column',
): T {
  if (json === null || json === undefined || json.trim() === '') return fallback
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    throw new Error(`Malformed JSON in ${column}.`)
  }
  const result = schema.safeParse(value)
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.map(String).join('.') || '<root>'}: ${issue.message}`)
      .join('; ')
    throw new Error(`Invalid JSON in ${column}: ${issues}`)
  }
  return result.data
}

/** Serializes a validated JSON column value for storage. */
export function serializeJsonColumn(value: unknown): string {
  return JSON.stringify(value) ?? 'null'
}

/**
 * Validates an already-decoded JSON column value and names the column in the
 * failure. Repository writes receive decoded values rather than the stored text,
 * so a shape mismatch (for example a rules collection arriving as an array where
 * an object was assumed) must still report which column rejected it instead of
 * surfacing a bare ZodError.
 */
export function parseJsonValue<T>(value: unknown, schema: z.ZodType<T>, column: string): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.map(String).join('.') || '<root>'}: ${issue.message}`)
      .join('; ')
    throw new Error(`Invalid JSON in ${column}: ${issues}`)
  }
  return result.data
}

/**
 * Narrows a stored value to an object of preserved extension fields. Anything
 * else (null, a scalar, an array) has no editable key/value rows.
 */
export function extensionObjectOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}
