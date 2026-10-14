import { describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import {
  approveBaseResume,
  baseResumeTextHash,
  frozenBaseResumeSource,
  loadApprovedBaseResume,
  normalizeBaseResumeText,
} from '../../src/lib/base-resumes'
import { migratedDatabase } from '../support/sqlite'
import { approvedBaseResumeMarkdown, draftBaseResumeMarkdown } from './fixtures'

/**
 * Step 1 document-history contracts. Approved Base Resume content and queued run
 * inputs must be frozen by value so that later edits cannot rewrite history and
 * a queued worker never reads facts that changed after enqueue.
 */

function withTempDirectory<T>(run: (directory: string) => T): T {
  const directory = mkdtempSync(resolve(tmpdir(), 'job-tracker-base-resumes-'))
  try {
    return run(directory)
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
}

describe('approved base resume history', () => {
  test('freezes content by value so a later approval cannot rewrite history', () => {
    withTempDirectory((directory) => {
      const knownDirectionIds = new Set(['fullstack'])
      approveBaseResume(directory, 'fullstack', approvedBaseResumeMarkdown, {
        version: 'v1',
        approvedAt: '2026-10-01',
        knownDirectionIds,
      })
      const approvedV1 = loadApprovedBaseResume(directory, 'fullstack', knownDirectionIds)
      expect(approvedV1).not.toBeNull()
      const frozen = frozenBaseResumeSource(approvedV1!)

      approveBaseResume(directory, 'fullstack', draftBaseResumeMarkdown, {
        version: 'v2',
        approvedAt: '2026-10-14',
        knownDirectionIds,
      })
      const approvedV2 = loadApprovedBaseResume(directory, 'fullstack', knownDirectionIds)

      expect(frozen.version).toBe('v1')
      expect(frozen.text).toBe(normalizeBaseResumeText(approvedBaseResumeMarkdown))
      expect(frozen.sha256).toBe(baseResumeTextHash(approvedBaseResumeMarkdown))
      expect(frozen).not.toHaveProperty('stale')
      expect(JSON.stringify(frozen)).not.toContain(directory)

      expect(approvedV2!.version).toBe('v2')
      expect(approvedV2!.text).toBe(normalizeBaseResumeText(draftBaseResumeMarkdown))
      expect(approvedV2!.sha256).not.toBe(frozen.sha256)
    })
  })

  test('reports an approved file whose content no longer matches its digest as stale', () => {
    withTempDirectory((directory) => {
      const knownDirectionIds = new Set(['fullstack'])
      approveBaseResume(directory, 'fullstack', approvedBaseResumeMarkdown, {
        version: 'v1',
        approvedAt: '2026-10-01',
        knownDirectionIds,
      })
      writeFileSync(resolve(directory, 'fullstack.md'), `${draftBaseResumeMarkdown}\n`)

      const reloaded = loadApprovedBaseResume(directory, 'fullstack', knownDirectionIds)
      expect(reloaded!.stale).toBe(true)
      expect(reloaded!.sha256).toBe(baseResumeTextHash(draftBaseResumeMarkdown))
      expect(reloaded!.approvedSha256).toBe(baseResumeTextHash(approvedBaseResumeMarkdown))
    })
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
