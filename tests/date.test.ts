import { describe, expect, test } from 'bun:test'
import { formatDisplayDate, isISODate } from '../src/lib/date'

describe('formatDisplayDate', () => {
  test('formats YYYY-MM-DD without shifting the calendar day', () => {
    const result = formatDisplayDate('2026-08-20')
    expect(result).toContain('Aug')
    expect(result).toContain('20')
    expect(result).toContain('2026')
  })

  test('returns non-ISO values unchanged', () => {
    expect(formatDisplayDate('not-a-date')).toBe('not-a-date')
  })

  test('validates ISO calendar dates', () => {
    expect(isISODate('2026-08-20')).toBe(true)
    expect(isISODate('2026-13-01')).toBe(false)
    expect(isISODate('08/20/2026')).toBe(false)
  })
})
