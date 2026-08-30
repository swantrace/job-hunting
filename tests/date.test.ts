import { describe, expect, test } from 'bun:test'
import { formatDisplayDate, isISODate, isISOTimestamp, nowISO, todayISO } from '../src/lib/date'

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
})

describe('isISODate', () => {
  test('accepts valid calendar dates', () => {
    expect(isISODate('2026-08-20')).toBe(true)
    expect(isISODate('2024-02-29')).toBe(true)
  })

  test('rejects malformed and impossible dates', () => {
    expect(isISODate('2026-13-01')).toBe(false)
    expect(isISODate('08/20/2026')).toBe(false)
    expect(isISODate('2026-02-29')).toBe(false)
    expect(isISODate('2026-00-10')).toBe(false)
    expect(isISODate('2026-08-32')).toBe(false)
    expect(isISODate('')).toBe(false)
  })
})

describe('todayISO', () => {
  test('returns YYYY-MM-DD for an Edmonton calendar date', () => {
    // 2026-08-29T05:00:00Z is still 2026-08-28 in Edmonton (UTC-6 during MDT).
    const value = todayISO(new Date('2026-08-29T05:00:00Z'))
    expect(value).toBe('2026-08-28')
    expect(isISODate(value)).toBe(true)
  })
})

describe('nowISO', () => {
  test('returns a UTC ISO 8601 timestamp with millisecond precision', () => {
    const value = nowISO(new Date('2026-08-29T18:32:14.123Z'))
    expect(value).toBe('2026-08-29T18:32:14.123Z')
    expect(isISOTimestamp(value)).toBe(true)
  })

  test('normalizes non-UTC input to the UTC representation', () => {
    const value = nowISO(new Date('2026-08-29T12:32:14.500-06:00'))
    expect(value).toBe('2026-08-29T18:32:14.500Z')
  })
})

describe('isISOTimestamp', () => {
  test('accepts UTC ISO 8601 timestamps', () => {
    expect(isISOTimestamp('2026-08-29T18:32:14.123Z')).toBe(true)
    expect(isISOTimestamp('2026-08-29T18:32:14Z')).toBe(true)
    expect(isISOTimestamp('2026-01-01T00:00:00.000Z')).toBe(true)
  })

  test('rejects offset/local forms and missing zone designators', () => {
    expect(isISOTimestamp('2026-08-29T18:32:14.123+00:00')).toBe(false)
    expect(isISOTimestamp('2026-08-29T18:32:14.123')).toBe(false)
    expect(isISOTimestamp('2026-08-29')).toBe(false)
    expect(isISOTimestamp('')).toBe(false)
  })

  test('rejects impossible calendar and clock values', () => {
    expect(isISOTimestamp('2026-13-01T00:00:00Z')).toBe(false)
    expect(isISOTimestamp('2026-02-29T00:00:00Z')).toBe(false)
    expect(isISOTimestamp('2026-08-29T25:00:00Z')).toBe(false)
    expect(isISOTimestamp('2026-08-29T00:60:00Z')).toBe(false)
    expect(isISOTimestamp('2026-08-29T00:00:60Z')).toBe(false)
  })
})
