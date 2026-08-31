import { describe, expect, test } from 'bun:test'
import { migratedDatabase } from '../support/sqlite'

describe('base-grounded drafts migration', () => {
  test('adds Markdown/validation/renderer columns and retains legacy JSON fields', () => {
    const sqlite = migratedDatabase()
    try {
      const columns = sqlite
        .query("PRAGMA table_info('generation_run_results')")
        .all()
        .map((column) => (column as { name: string }).name)
      for (const column of [
        'resume_json',
        'cover_letter_json',
        'ats_audit_json',
        'resume_markdown',
        'cover_letter_markdown',
        'draft_validation_json',
        'renderer_version',
      ]) {
        expect(columns).toContain(column)
      }
    } finally {
      sqlite.close()
    }
  })

  test('creates one-to-one baseline_generation_results', () => {
    const sqlite = migratedDatabase()
    try {
      const columns = sqlite
        .query("PRAGMA table_info('baseline_generation_results')")
        .all()
        .map((column) => (column as { name: string }).name)
      for (const column of [
        'baseline_generation_run_id',
        'resume_markdown',
        'draft_validation_json',
        'renderer_version',
        'created_at',
        'updated_at',
      ]) {
        expect(columns).toContain(column)
      }
    } finally {
      sqlite.close()
    }
  })

  test('passes foreign-key and integrity checks on an empty migrated database', () => {
    const sqlite = migratedDatabase()
    try {
      expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
      expect(sqlite.query('PRAGMA integrity_check').all()).toEqual([{ integrity_check: 'ok' }])
    } finally {
      sqlite.close()
    }
  })
})
