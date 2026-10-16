import { describe, expect, test } from 'bun:test'
import {
  type ApprovedBaseResume,
  baseResumeTextHash,
  frozenBaseResumeSource,
  loadApprovedBaseResume,
  normalizeBaseResumeText,
} from '../../src/lib/career/base-resumes'
import { createCareerTestDatabase } from '../support/career-db'
import { migratedDatabase } from '../support/sqlite'
import { approvedBaseResumeMarkdown, draftBaseResumeMarkdown } from './fixtures'

/**
 * document-history contracts. Approved Base Resume content and queued run
 * inputs must be frozen by value so that later edits cannot rewrite history and
 * a queued worker never reads facts that changed after enqueue.
 */

/** An approved version as the database projects it, built without touching disk. */
function approvedResume(
  markdown: string,
  overrides: Partial<ApprovedBaseResume> = {},
): ApprovedBaseResume {
  const sha256 = baseResumeTextHash(markdown)
  return {
    direction: 'fullstack',
    fileName: 'fullstack.md',
    version: 'v1',
    approvedAt: '2026-10-01',
    approvedSha256: sha256,
    text: normalizeBaseResumeText(markdown),
    sha256,
    empty: false,
    stale: false,
    ...overrides,
  }
}

describe('approved base resume history', () => {
  test('freezes content by value so a later approval cannot rewrite history', () => {
    const frozen = frozenBaseResumeSource(approvedResume(approvedBaseResumeMarkdown))
    const beforeLaterApproval = structuredClone(frozen)

    const approvedV2 = approvedResume(draftBaseResumeMarkdown, {
      version: 'v2',
      approvedAt: '2026-10-14',
    })

    expect(frozen.version).toBe('v1')
    expect(frozen.text).toBe(normalizeBaseResumeText(approvedBaseResumeMarkdown))
    expect(frozen.sha256).toBe(baseResumeTextHash(approvedBaseResumeMarkdown))
    // Exactly the frozen shape: no path, no digest bookkeeping, no staleness flag.
    expect(Object.keys(frozen).sort()).toEqual([
      'approvedAt',
      'direction',
      'sha256',
      'text',
      'version',
    ])

    expect(approvedV2.version).toBe('v2')
    expect(approvedV2.text).toBe(normalizeBaseResumeText(draftBaseResumeMarkdown))
    expect(approvedV2.sha256).not.toBe(frozen.sha256)
    expect(frozen).toEqual(beforeLaterApproval)
  })

  test('reads the approved version from the database and reports a drifted digest as stale', () => {
    const database = createCareerTestDatabase()
    try {
      const knownDirectionIds = new Set(['fullstack'])
      const approved = loadApprovedBaseResume('fullstack', knownDirectionIds, database.executor)
      expect(approved?.stale).toBe(false)
      expect(approved?.approvedSha256).toBe(baseResumeTextHash(approvedBaseResumeMarkdown))

      // The draft document is only an import source; the stored version is the
      // authority and its digest mismatch is what marks a document stale.
      database.sqlite
        .query("UPDATE career_base_resumes SET markdown = ? WHERE direction_key = 'fullstack'")
        .run(`${draftBaseResumeMarkdown}\n`)

      const reloaded = loadApprovedBaseResume('fullstack', knownDirectionIds, database.executor)
      expect(reloaded?.stale).toBe(true)
      expect(reloaded?.sha256).toBe(baseResumeTextHash(draftBaseResumeMarkdown))
      expect(reloaded?.approvedSha256).toBe(baseResumeTextHash(approvedBaseResumeMarkdown))
    } finally {
      database.cleanup()
    }
  })
})

describe('enqueue snapshots', () => {
  test('store frozen inputs by value in the existing run tables', () => {
    const sqlite = migratedDatabase()
    try {
      const columns = sqlite
        .query("SELECT name, type FROM pragma_table_info('generation_runs')")
        .all() as Array<{ name: string; type: string }>
      for (const name of ['frozen_input_json', 'input_hash']) {
        const column = columns.find((item) => item.name === name)
        expect(column?.type).toBe('TEXT')
      }

      const candidateColumns = sqlite
        .query("SELECT name, type FROM pragma_table_info('application_analysis_runs')")
        .all() as Array<{ name: string; type: string }>
      expect(candidateColumns.find((item) => item.name === 'input_snapshot_json')?.type).toBe(
        'TEXT',
      )
      expect(candidateColumns.find((item) => item.name === 'input_hash')?.type).toBe('TEXT')
    } finally {
      sqlite.close()
    }
  })
})
