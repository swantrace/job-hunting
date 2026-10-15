import { describe, expect, test } from 'bun:test'
import { migratedDatabase, migrationFolderUpTo, removeTempDir } from '../db/support/migrations'

/** Applies migrations 0..`lastIndex` and cleans the temporary folder. */
function migratedThrough(lastIndex: number) {
  const folder = migrationFolderUpTo(lastIndex)
  try {
    return migratedDatabase(folder)
  } finally {
    removeTempDir(folder)
  }
}

function columnNames(sqlite: ReturnType<typeof migratedDatabase>, table: string): string[] {
  return sqlite
    .query(`PRAGMA table_info('${table}')`)
    .all()
    .map((column) => (column as { name: string }).name)
}

describe('base-grounded drafts migration', () => {
  test('adds Markdown/validation/renderer columns and retains legacy JSON fields', () => {
    const sqlite = migratedThrough(23)
    try {
      const columns = columnNames(sqlite, 'generation_run_results')
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
    const sqlite = migratedThrough(23)
    try {
      const columns = columnNames(sqlite, 'baseline_generation_results')
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

  test('folds both result side tables into generation_runs after 0027', () => {
    const sqlite = migratedDatabase()
    try {
      // The dropped side tables are gone.
      expect(
        sqlite
          .query(
            "SELECT count(*) AS count FROM sqlite_master WHERE name = 'generation_run_results'",
          )
          .get(),
      ).toEqual({ count: 0 })
      expect(
        sqlite
          .query(
            "SELECT count(*) AS count FROM sqlite_master WHERE name = 'baseline_generation_results'",
          )
          .get(),
      ).toEqual({ count: 0 })
      // Their columns now live on the single generation_runs table.
      const columns = columnNames(sqlite, 'generation_runs')
      for (const column of [
        'kind',
        'baseline_json',
        'evidence_snapshot_json',
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
