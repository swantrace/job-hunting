import { isISODate, todayISO } from './date'
import {
  collectDraftText,
  countDraftBullets,
  countDraftWords,
  type DocumentDraft,
  type DocumentSectionId,
} from './document-draft'

/**
 * Deterministic completeness checks for validated document drafts. These are
 * advisory warnings, never rewrites: they surface section-contract problems,
 * missing education entries, implausible dates, repeated titles/salutations,
 * and page-budget overruns so the reviewer can fix the source or regenerate.
 */

export type DraftValidationWarning = {
  code: string
  message: string
}

export type SectionContract = {
  required: DocumentSectionId[]
  order: DocumentSectionId[]
}

const normalizeForComparison = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase()

/** Ensures required sections are present, non-empty, and follow renderer order. */
export function validateSectionContract(
  draft: DocumentDraft,
  contract: SectionContract,
): DraftValidationWarning[] {
  const warnings: DraftValidationWarning[] = []
  const sections = new Map(draft.sections.map((section) => [section.id, section]))
  for (const id of contract.required) {
    if (!sections.has(id))
      warnings.push({ code: 'missing-section', message: `The required ${id} section is missing.` })
  }
  for (const section of draft.sections)
    if (!section.blocks.some((block) => block.text.trim()))
      warnings.push({ code: 'empty-section', message: `The ${section.id} section is empty.` })

  const expectedIndex = new Map(contract.order.map((id, index) => [id, index]))
  let previous = -1
  for (const section of draft.sections) {
    const current = expectedIndex.get(section.id)
    if (current === undefined) continue
    if (current < previous) {
      warnings.push({
        code: 'section-order',
        message: `The ${section.id} section is out of order.`,
      })
      break
    }
    previous = current
  }
  return warnings
}

function sectionWordCount(draft: DocumentDraft, sectionId: DocumentSectionId): number {
  const section = draft.sections.find((item) => item.id === sectionId)
  if (!section) return 0
  return (
    section.blocks
      .map((block) => block.text)
      .join(' ')
      .match(/[\p{L}\p{N}]+/gu) ?? []
  ).length
}

export function validateSectionWordBudget(
  draft: DocumentDraft,
  sectionId: DocumentSectionId,
  maxWords: number,
): DraftValidationWarning[] {
  const words = sectionWordCount(draft, sectionId)
  return words > maxWords
    ? [
        {
          code: 'over-section-word-budget',
          message: `The ${sectionId} section has ${words} words (budget ${maxWords}).`,
        },
      ]
    : []
}

export function validateSectionBlockCount(
  draft: DocumentDraft,
  sectionId: DocumentSectionId,
  options: { min?: number; max?: number },
): DraftValidationWarning[] {
  const count = draft.sections.find((section) => section.id === sectionId)?.blocks.length ?? 0
  if (options.min !== undefined && count < options.min)
    return [
      {
        code: 'too-few-section-blocks',
        message: `The ${sectionId} section has ${count} blocks (minimum ${options.min}).`,
      },
    ]
  if (options.max !== undefined && count > options.max)
    return [
      {
        code: 'too-many-section-blocks',
        message: `The ${sectionId} section has ${count} blocks (maximum ${options.max}).`,
      },
    ]
  return []
}

export type CanonicalEducationEntry = { degree?: string; school: string }

/**
 * Every canonical education entry must be represented. A missing school or
 * degree is reported as an omission so education is never silently dropped.
 */
export function validateEducationCoverage(
  draft: DocumentDraft,
  entries: CanonicalEducationEntry[],
): DraftValidationWarning[] {
  const text = collectDraftText(draft).toLowerCase()
  const warnings: DraftValidationWarning[] = []
  for (const entry of entries) {
    const missing: string[] = []
    if (entry.school && !text.includes(normalizeForComparison(entry.school))) missing.push('school')
    if (entry.degree && !text.includes(normalizeForComparison(entry.degree))) missing.push('degree')
    if (missing.length)
      warnings.push({
        code: 'missing-education',
        message: `Education entry "${entry.school}" is missing its ${missing.join(' and ')}.`,
      })
  }
  return warnings
}

function yearsIn(text: string): number[] {
  return [...text.matchAll(/\b(19|20)\d{2}\b/g)].map((match) => Number(match[0]))
}

/**
 * Flags references to years in the future (more than one year ahead of the
 * current date) and explicit full dates that are not valid calendar dates.
 */
export function validateDateBounds(
  draft: DocumentDraft,
  today: string = todayISO(),
): DraftValidationWarning[] {
  const warnings: DraftValidationWarning[] = []
  const currentYear = Number(today.slice(0, 4))
  const text = collectDraftText(draft)
  for (const year of yearsIn(text))
    if (year > currentYear + 1)
      warnings.push({
        code: 'future-date',
        message: `The document references a future year ${year}.`,
      })

  for (const match of text.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)) {
    if (!isISODate(match[0]))
      warnings.push({
        code: 'invalid-date',
        message: `The document references an invalid date "${match[0]}".`,
      })
  }
  return warnings
}

function occurrences(text: string, needle: string): number {
  const normalized = normalizeForComparison(needle)
  if (!normalized) return 0
  const haystack = normalizeForComparison(text)
  let count = 0
  let index = haystack.indexOf(normalized)
  while (index !== -1) {
    count += 1
    index = haystack.indexOf(normalized, index + normalized.length)
  }
  return count
}

/**
 * A cover-letter salutation (e.g. "Dear Hiring Team") must appear once. A title
 * repeated more than twice in a resume is reported as repetitive.
 */
export function validateRepeatedTitleOrSalutation(
  draft: DocumentDraft,
  options: { title?: string; salutation?: string },
): DraftValidationWarning[] {
  const warnings: DraftValidationWarning[] = []
  const text = collectDraftText(draft)
  if (options.salutation && occurrences(text, options.salutation) > 1)
    warnings.push({
      code: 'repeated-salutation',
      message: 'The salutation appears more than once in the cover letter.',
    })
  if (options.title && occurrences(text, options.title) > 2)
    warnings.push({
      code: 'repeated-title',
      message: 'The target title appears more than twice in the resume.',
    })
  return warnings
}

/**
 * Page-budget guard. Overruns are reported, never silently truncated.
 */
export function validatePageBudget(
  draft: DocumentDraft,
  options: { maxWords?: number; maxBullets?: number } = {},
): DraftValidationWarning[] {
  const warnings: DraftValidationWarning[] = []
  const maxWords = options.maxWords ?? 900
  const maxBullets = options.maxBullets ?? 60
  const words = countDraftWords(draft)
  const bullets = countDraftBullets(draft)
  if (words > maxWords)
    warnings.push({
      code: 'over-word-budget',
      message: `The document has ${words} words (budget ${maxWords}).`,
    })
  if (bullets > maxBullets)
    warnings.push({
      code: 'over-bullet-budget',
      message: `The document has ${bullets} bullets (budget ${maxBullets}).`,
    })
  return warnings
}

export function validateDocumentDraft(
  draft: DocumentDraft,
  options: {
    education?: CanonicalEducationEntry[]
    title?: string
    salutation?: string
    maxWords?: number
    maxBullets?: number
    today?: string
    supportedMetrics?: string[]
    excludedSkills?: string[]
    sectionContract?: SectionContract
    sectionWordBudgets?: Partial<Record<DocumentSectionId, number>>
    sectionBlockBudgets?: Partial<Record<DocumentSectionId, { min?: number; max?: number }>>
  } = {},
): DraftValidationWarning[] {
  return [
    ...(options.sectionContract ? validateSectionContract(draft, options.sectionContract) : []),
    ...Object.entries(options.sectionWordBudgets ?? {}).flatMap(([sectionId, maxWords]) =>
      validateSectionWordBudget(draft, sectionId as DocumentSectionId, maxWords),
    ),
    ...Object.entries(options.sectionBlockBudgets ?? {}).flatMap(([sectionId, budget]) =>
      validateSectionBlockCount(draft, sectionId as DocumentSectionId, budget),
    ),
    ...validateEducationCoverage(draft, options.education ?? []),
    ...validateDateBounds(draft, options.today),
    ...validateRepeatedTitleOrSalutation(draft, {
      title: options.title,
      salutation: options.salutation,
    }),
    ...validatePageBudget(draft, { maxWords: options.maxWords, maxBullets: options.maxBullets }),
    ...validateMetricProvenance(draft, options.supportedMetrics ?? []),
    ...validateExcludedSkills(draft, options.excludedSkills ?? []),
  ]
}

const metricClaimPattern =
  /(?:USD|CAD|EUR|GBP|\$)\s?\d[\d,.]*|\d+(?:\.\d+)?\s?(?:%|percent|per cent|hours|days|weeks|months|years|users|requests|ms|seconds|minutes)\b/gi

/** Extracts deterministic metric-like claims (currency, percentage, or unit counts). */
export function extractMetricClaims(text: string): string[] {
  return [...new Set((text.match(metricClaimPattern) ?? []).map(normalizeForComparison))]
}

/**
 * Flags metric claims that do not trace to the supplied source wording. This is
 * advisory provenance: a metric must appear in the Base Resume or canonical
 * Career Data before it may appear in a draft.
 */
export function validateMetricProvenance(
  draft: DocumentDraft,
  supportedMetrics: string[],
): DraftValidationWarning[] {
  const supported = new Set(supportedMetrics.map(normalizeForComparison))
  const warnings: DraftValidationWarning[] = []
  for (const claim of extractMetricClaims(collectDraftText(draft)))
    if (!supported.has(claim))
      warnings.push({
        code: 'unsupported-metric',
        message: `The document claims "${claim}", which is not in the supplied source data.`,
      })
  return warnings
}

/**
 * Flags any excluded (skipped or pending) skill name that reappears in the
 * draft. The model must never mention a skill the user did not Include.
 */
export function validateExcludedSkills(
  draft: DocumentDraft,
  excludedSkills: string[],
): DraftValidationWarning[] {
  const text = normalizeForComparison(collectDraftText(draft))
  const warnings: DraftValidationWarning[] = []
  for (const skill of excludedSkills) {
    const needle = normalizeForComparison(skill)
    if (needle && text.includes(needle))
      warnings.push({
        code: 'excluded-skill-mentioned',
        message: `The document mentions the excluded skill "${skill}".`,
      })
  }
  return warnings
}
