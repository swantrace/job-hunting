const todayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Edmonton',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const displayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

export const todayISO = () => todayFormatter.format(new Date())
export const isISODate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))

/**
 * Formats a stored `YYYY-MM-DD` value for display without parsing it as a UTC
 * midnight and shifting the calendar day. Only display boundaries should use it;
 * storage, inputs, sorting, and comparisons keep the ISO value.
 */
export const formatDisplayDate = (value: string) => {
  if (!isISODate(value)) return value
  const [year, month, day] = value.split('-').map(Number)
  return displayFormatter.format(new Date(Date.UTC(year, month - 1, day)))
}
