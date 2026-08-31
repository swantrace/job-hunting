import { describe, expect, test } from 'bun:test'
import {
  evidenceStatusCopy,
  isEvidenceStatus,
  normalizeEvidenceStatus,
  validateApplicationDecision,
} from '../src/lib/evidence/status'

describe('evidence statuses and legacy normalization', () => {
  test('normalizes historical missing to unknown-evidence exactly once', () => {
    expect(normalizeEvidenceStatus('missing')).toBe('unknown-evidence')
    expect(normalizeEvidenceStatus('direct')).toBe('direct')
    expect(normalizeEvidenceStatus('transferable')).toBe('transferable')
    expect(normalizeEvidenceStatus('unknown-evidence')).toBe('unknown-evidence')
  })

  test('rejects unknown statuses and recognizes the canonical three', () => {
    expect(() => normalizeEvidenceStatus('nope')).toThrow('Unknown evidence status')
    expect(isEvidenceStatus('unknown-evidence')).toBe(true)
    expect(isEvidenceStatus('missing')).toBe(false)
  })

  test('unknown-evidence copy never claims the user lacks a skill', () => {
    expect(evidenceStatusCopy('unknown-evidence')).toContain('does not verify')
    expect(evidenceStatusCopy('unknown-evidence')).not.toContain('missing skill')
  })

  test('application decisions are only Include (with a reason) or Skip', () => {
    expect(validateApplicationDecision('include', 'Strong transferable evidence')).toEqual({
      valid: true,
      errors: [],
    })
    expect(validateApplicationDecision('include', '  ')).toEqual({
      valid: false,
      errors: ['A reason is required to Include.'],
    })
    expect(validateApplicationDecision('skip', null)).toEqual({ valid: true, errors: [] })
    expect(validateApplicationDecision('pending', null)).toEqual({
      valid: false,
      errors: ['Choose Include (with a reason) or Skip.'],
    })
  })
})
