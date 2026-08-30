import { describe, expect, test } from 'bun:test'
import { classifyAnalysisRunState } from '../../src/lib/analysis-run-state'
import { canonicalHash } from '../../src/lib/canonical-hash'
import { resolveWorkspaceTab, reviewGateCopy } from '../../src/lib/workspace/state'
import { migratedDatabase } from '../support/sqlite'

/**
 * End-to-end smoke test for the versioned analysis workflow. These invariants
 * span the schema, freshness, progression, and copy layers and are deliberately
 * re-asserted here as a single regression summary.
 */
describe('versioned workflow end-to-end invariants', () => {
  test('legacy analysis reads as outdated with a rerun action, never "never analyzed"', () => {
    const legacy = reviewGateCopy('legacy')
    expect(legacy.message.toLowerCase()).toContain('outdated')
    expect(legacy.actionLabel).toMatch(/re-run/i)
    expect(legacy.message).not.toContain('never')
  })

  test('Contact and Activities remain available regardless of AI readiness', () => {
    const locked = {
      jobAnalysisCurrent: false,
      reviewReady: false,
      hasHistoricalReview: false,
      hasHistoricalDocuments: false,
    }
    expect(resolveWorkspaceTab('contacts', locked)).toBe('contacts')
    expect(resolveWorkspaceTab('activity', locked)).toBe('activity')
    expect(resolveWorkspaceTab('review', locked)).toBe('application')
    expect(resolveWorkspaceTab('documents', locked)).toBe('application')
  })

  test('a failed latest attempt never hides an older usable result', () => {
    const result = classifyAnalysisRunState(
      [
        { id: 2, status: 'Failed', inputHash: 'new-hash', schemaVersion: '3.0.0' },
        { id: 1, status: 'Completed', inputHash: 'current-hash', schemaVersion: '3.0.0' },
      ],
      'current-hash',
      '3.0.0',
    )
    expect(result.state).toBe('failed')
    expect(result.currentCompleted?.id).toBe(1)
  })

  test('canonical hashing is stable regardless of key insertion order', () => {
    expect(canonicalHash({ a: 1, b: 2 })).toBe(canonicalHash({ b: 2, a: 1 }))
  })

  test('the complete migration history applies with FK integrity', () => {
    const sqlite = migratedDatabase()
    try {
      expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
      const tables = sqlite
        .query("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((row) => String((row as { name: string }).name))
      for (const table of [
        'job_posting_analyses',
        'application_analysis_runs',
        'analysis_run_decisions',
        'generation_runs',
      ]) {
        expect(tables).toContain(table)
      }
    } finally {
      sqlite.close()
    }
  })
})
