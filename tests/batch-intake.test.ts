import { describe, expect, test } from 'bun:test'
import { parseBatchIntake, validateIntakeUrl } from '../src/lib/batch-intake'

describe('batch job post intake', () => {
  test('preserves input order and classifies URLs vs pasted text', () => {
    const items = parseBatchIntake(
      'https://jobs.example.com/1\nFull job description text\nhttps://jobs.example.com/2\n',
    )
    expect(items.map((item) => item.index)).toEqual([1, 2, 3])
    expect(items.map((item) => item.kind)).toEqual(['url', 'text', 'url'])
    expect(items.map((item) => item.state)).toEqual(['pending', 'pending', 'pending'])
  })

  test('rejects http, credentials, localhost, and private addresses', () => {
    expect(validateIntakeUrl('http://jobs.example.com').ok).toBe(false)
    expect(validateIntakeUrl('https://user:pass@jobs.example.com').ok).toBe(false)
    expect(validateIntakeUrl('https://localhost/job').ok).toBe(false)
    expect(validateIntakeUrl('https://127.0.0.1/job').ok).toBe(false)
    expect(validateIntakeUrl('https://192.168.1.10/job').ok).toBe(false)
    expect(validateIntakeUrl('https://10.0.0.5/job').ok).toBe(false)
    expect(validateIntakeUrl('not a url').ok).toBe(false)
  })

  test('accepts public https URLs', () => {
    expect(validateIntakeUrl('https://jobs.example.com/role').ok).toBe(true)
  })

  test('unsafe URLs become needs-pasted-text instead of failing the batch', () => {
    const items = parseBatchIntake('http://insecure.example.com\n')
    expect(items[0].state).toBe('needs-pasted-text')
    expect(items[0].reason).toBe('Only https URLs are accepted.')
    expect(items[0].url).toBe('http://insecure.example.com')
  })

  test('skips blank lines and keeps original raw text', () => {
    const items = parseBatchIntake('  https://jobs.example.com  \n\n')
    expect(items).toHaveLength(1)
    expect(items[0].raw).toBe('https://jobs.example.com')
    expect(items[0].url).toBe('https://jobs.example.com')
  })
})
