import { describe, expect, test } from 'bun:test'
import { advanceStatus } from '../src/lib/transitions'

describe('pipeline transitions', () => {
  test('activity advances the pipeline', () => {
    expect(advanceStatus('Saved', 'Follow Up')).toBe('Follow Up')
    expect(advanceStatus('Applied', 'Interviewing')).toBe('Interviewing')
  })

  test('activity never regresses the pipeline', () => {
    expect(advanceStatus('Interviewing', 'Follow Up')).toBe('Interviewing')
  })

  test('terminal states cannot advance automatically', () => {
    expect(advanceStatus('Rejected', 'Interviewing')).toBe('Rejected')
    expect(advanceStatus('Archived', 'Follow Up')).toBe('Archived')
  })
})
