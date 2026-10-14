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

/** Human-readable date range from the stored values; never invents precision. */
export function dateRange(
  record: { displayDates: string | null; startDate: string | null; endDate: string | null },
  separator = ' – ',
): string {
  if (record.displayDates) return record.displayDates
  const dates = [record.startDate, record.endDate].filter(Boolean)
  return dates.length > 0 ? dates.join(separator) : 'Dates not recorded'
}
