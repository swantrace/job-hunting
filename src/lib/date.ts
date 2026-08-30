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

const calendarDatePattern = /^\d{4}-\d{2}-\d{2}$/
const utcTimestampPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?Z$/

/**
 * Returns the current calendar date as `YYYY-MM-DD` in America/Edmonton.
 * Business dates (posted/applied/target dates, follow-up and interview dates)
 * use this representation. Accepts an optional `now` for deterministic tests.
 */
export const todayISO = (now: Date = new Date()) => todayFormatter.format(now)

/**
 * Returns the current operational audit timestamp as a UTC ISO 8601 datetime
 * with millisecond precision and a `Z` designator, e.g.
 * `2026-08-29T18:32:14.123Z`. Lifecycle/audit columns (`created_at`,
 * `updated_at`, `started_at`, `completed_at`, capture/confirmation/upload
 * times) use this representation. Accepts an optional `now` for deterministic
 * tests.
 */
export const nowISO = (now: Date = new Date()) => now.toISOString()

/**
 * Strictly validates a `YYYY-MM-DD` calendar date, rejecting both malformed
 * strings and impossible days such as `2026-02-29`.
 */
export const isISODate = (value: string) => {
  if (!calendarDatePattern.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  if (month < 1 || month > 12 || day < 1 || day > 31) return false
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}

/**
 * Strictly validates a UTC ISO 8601 operational timestamp with a `Z`
 * designator, e.g. `2026-08-29T18:32:14.123Z`. Rejects local/offset forms,
 * missing zone designators, and impossible calendar/time values.
 */
export const isISOTimestamp = (value: string) => {
  const match = utcTimestampPattern.exec(value)
  if (!match) return false
  const [, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr] = match
  const year = Number(yearStr)
  const month = Number(monthStr)
  const day = Number(dayStr)
  const hour = Number(hourStr)
  const minute = Number(minuteStr)
  const second = Number(secondStr)
  if (month < 1 || month > 12 || day < 1 || day > 31) return false
  if (hour > 23 || minute > 59 || second > 59) return false
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second
  )
}

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
