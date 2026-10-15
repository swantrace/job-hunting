import type { GenerationRules } from '../../../src/lib/career/json-schemas'
import { documentDraftPolicy } from '../../../src/lib/document-draft-policy'

/**
 * Only an http(s) value is rendered as a link: a stored `javascript:` or other
 * scheme stays plain text, so career data can never become a script URL.
 */
export function httpUrl(value: string | null | undefined): string | null {
  return value && /^https?:\/\//i.test(value) ? value : null
}

/** Query string shared by the retired-record filter across list/form URLs. */
export function retiredQuery(includeRetired: boolean): string {
  return includeRetired ? '?showRetired=1' : ''
}

/** Human-readable budget summary for a direction; falls back to documented seeds. */
export function directionBudgetSummary(rules: GenerationRules | null): string {
  const maxWords = rules?.maxWords ?? documentDraftPolicy.resume.maxWords
  const maxBullets = rules?.maxBullets ?? documentDraftPolicy.resume.maxBullets
  const summaryMaxWords =
    rules?.summaryMaxWords ??
    rules?.sectionWordBudgets?.summary ??
    documentDraftPolicy.resume.summaryMaxWords
  const sections = Object.entries(rules?.sectionWordBudgets ?? {}).filter(
    ([section]) => section !== 'summary',
  )
  return [
    `${maxWords} words`,
    `${maxBullets} bullets`,
    `summary ${summaryMaxWords} words`,
    ...sections.map(([section, words]) => `${section} ${words} words`),
  ].join(' · ')
}

/** Human-readable date range from the stored values; never invents precision. */
export function dateRange(
  record: { displayDates: string | null; startDate: string | null; endDate: string | null },
  separator = ' – ',
): string {
  if (record.displayDates) return record.displayDates
  const dates = [record.startDate, record.endDate].filter(Boolean)
  return dates.length > 0 ? dates.join(separator) : 'Dates not recorded'
}
