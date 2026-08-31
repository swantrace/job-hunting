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
 * Destructive contract migration (0021): preserves core resources and Job Post
 * raw text/URLs while resetting authorized derived AI history.
 */

function tableNames(sqlite: Database): string[] {
  return sqlite
    .query("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map((row) => String((row as { name: string }).name))
}

describe('destructive contract migration', () => {
  test('applies on an empty database and drops the legacy application-skill table', () => {
    const sqlite = migratedDatabase()
    try {
      expect(tableNames(sqlite)).not.toContain('job_applications_to_skills')
      expect(tableNames(sqlite)).toContain('job_requirements_to_skills')
      expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
      expect(sqlite.query('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' })
    } finally {
      sqlite.close()
    }
  })

  test('preserves core resources and resets derived history over a populated fixture', () => {
    const folder = migrationFolderUpTo(20)
    const sqlite = migratedAt(folder)
    try {
      const fixture = seedPreCleanupFixture(sqlite)
      migrate(drizzle({ client: sqlite }), { migrationsFolder: './drizzle' })

      // Core preserved facts.
      expect(
        sqlite
          .query('SELECT url FROM job_applications WHERE id = ?')
          .get(fixture.applicationIds[0]),
      ).toEqual({ url: 'https://example.com/careers/frontend-123' })
      const posting = sqlite
        .query('SELECT raw_text, content_hash, version FROM job_postings WHERE id = ?')
        .get(fixture.preservedJobPostings[0].id) as {
        raw_text: string
        content_hash: string
        version: number
      }
      expect(posting.raw_text).toBe(fixture.preservedJobPostings[0].rawText)
      expect(posting.content_hash).toBe(fixture.preservedJobPostings[0].contentHash)
      expect(posting.version).toBe(1)

      // Legacy skills reset; Drive connection preserved.
      expect(sqlite.query('SELECT count(*) AS count FROM skills').get()).toEqual({ count: 0 })
      expect(sqlite.query('SELECT count(*) AS count FROM google_drive_connections').get()).toEqual({
        count: 1,
      })

      // Derived history reset.
      expect(sqlite.query('SELECT count(*) AS count FROM job_posting_analyses').get()).toEqual({
        count: 0,
      })
      expect(sqlite.query('SELECT count(*) AS count FROM job_requirements').get()).toEqual({
        count: 0,
      })
      expect(sqlite.query('SELECT count(*) AS count FROM application_analysis_runs').get()).toEqual(
        {
          count: 0,
        },
      )
      expect(sqlite.query('SELECT count(*) AS count FROM generation_runs').get()).toEqual({
        count: 0,
      })

      expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
      expect(sqlite.query('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' })
    } finally {
      sqlite.close()
      removeTempDir(folder)
    }
  })
})
