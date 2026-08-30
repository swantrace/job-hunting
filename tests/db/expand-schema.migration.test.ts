import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { seedPreCleanupFixture } from './fixtures/pre-cleanup'
import {
  migratedAt,
  migratedDatabase,
  migrationFolderUpTo,
  removeTempDir,
} from './support/migrations'

/**
 * Canonical expand migration contract (0020). Verifies lineage/version/activity
 * columns and audit indexes are added without removing legacy storage, on both
 * an empty database and a populated pre-cleanup fixture.
 */

function columnNames(sqlite: Database, table: string): string[] {
  return sqlite
    .query(`PRAGMA table_info('${table}')`)
    .all()
    .map((row) => String((row as { name: string }).name))
}

function indexNames(sqlite: Database, table: string): string[] {
  return sqlite
    .query(`PRAGMA index_list('${table}')`)
    .all()
    .map((row) => String((row as { name: string }).name))
}

function foreignKeys(sqlite: Database, table: string): Array<{ from: string; table: string }> {
  return sqlite
    .query(`PRAGMA foreign_key_list('${table}')`)
    .all()
    .map((row) => ({
      from: String((row as { from: string }).from),
      table: String((row as { table: string }).table),
    }))
}

describe('canonical lineage expand migration', () => {
  test('adds canonical columns and indexes on an empty database', () => {
    const sqlite = migratedDatabase()
    try {
      // Job Post versioning replaces the application-unique index.
      expect(columnNames(sqlite, 'job_postings')).toContain('version')
      expect(indexNames(sqlite, 'job_postings')).not.toContain(
        'job_postings_application_unique_idx',
      )
      expect(indexNames(sqlite, 'job_postings')).toContain(
        'job_postings_application_version_unique_idx',
      )
      expect(indexNames(sqlite, 'job_postings')).toContain('job_postings_application_hash_idx')

      // Clean result JSON plus partial in-flight uniqueness.
      expect(columnNames(sqlite, 'job_posting_analyses')).toContain('result_json')
      expect(indexNames(sqlite, 'job_posting_analyses')).toContain(
        'job_posting_analyses_inflight_unique_idx',
      )

      // Requirement-skill mapping attributes.
      expect(columnNames(sqlite, 'job_requirements_to_skills')).toContain('raw_label')
      expect(columnNames(sqlite, 'job_requirements_to_skills')).toContain('confidence')

      // Resource/activity audit columns.
      expect(columnNames(sqlite, 'companies')).toContain('updated_at')
      expect(columnNames(sqlite, 'contacts')).toContain('created_at')
      expect(columnNames(sqlite, 'contacts')).toContain('updated_at')
      expect(columnNames(sqlite, 'follow_ups')).toContain('action_type')
      expect(columnNames(sqlite, 'interviews')).toContain('round_type')
      expect(columnNames(sqlite, 'job_applications_to_contacts')).toContain('relationship_type')
      expect(columnNames(sqlite, 'job_applications_to_contacts')).toContain('is_primary')
      expect(indexNames(sqlite, 'job_applications_to_contacts')).toContain(
        'job_applications_to_contacts_primary_unique_idx',
      )

      // Downstream lineage FKs.
      expect(
        foreignKeys(sqlite, 'application_analysis_runs').some(
          (fk) => fk.from === 'job_posting_analysis_id',
        ),
      ).toBe(true)
      expect(
        foreignKeys(sqlite, 'generation_runs').some(
          (fk) => fk.from === 'application_analysis_run_id',
        ),
      ).toBe(true)
      expect(indexNames(sqlite, 'generation_runs')).toContain('generation_runs_inflight_unique_idx')

      expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
      expect(sqlite.query('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' })
    } finally {
      sqlite.close()
    }
  })

  test('preserves populated fixtures and marks legacy rows as version 1 with null lineage', () => {
    const folder = migrationFolderUpTo(19)
    const sqlite = migratedAt(folder)
    try {
      const fixture = seedPreCleanupFixture(sqlite)

      // Apply only the expand migration (0020) over the populated fixture.
      migrate(drizzle({ client: sqlite }), { migrationsFolder: migrationFolderUpTo(20) })

      const versions = sqlite
        .query('SELECT version FROM job_postings ORDER BY id')
        .all()
        .map((row) => Number((row as { version: number }).version))
      expect(versions).toEqual([1, 1])

      expect(
        sqlite.query('SELECT job_posting_analysis_id FROM application_analysis_runs').all(),
      ).toEqual([{ job_posting_analysis_id: null }])
      expect(sqlite.query('SELECT application_analysis_run_id FROM generation_runs').all()).toEqual(
        [{ application_analysis_run_id: null }],
      )

      // Core preserved facts survive the expand step untouched.
      expect(
        sqlite
          .query('SELECT url FROM job_applications WHERE id = ?')
          .get(fixture.applicationIds[0]),
      ).toEqual({ url: 'https://example.com/careers/frontend-123' })
      expect(
        sqlite
          .query('SELECT raw_text, content_hash FROM job_postings WHERE id = ?')
          .get(fixture.preservedJobPostings[0].id),
      ).toEqual({
        raw_text: fixture.preservedJobPostings[0].rawText,
        content_hash: fixture.preservedJobPostings[0].contentHash,
      })

      // The migrate-then-seed fixture remains structurally sound after expand.
      expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
      expect(sqlite.query('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' })
    } finally {
      sqlite.close()
      removeTempDir(folder)
    }
  })
})
