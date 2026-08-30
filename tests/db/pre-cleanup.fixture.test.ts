import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { seedPreCleanupFixture } from './fixtures/pre-cleanup'
import {
  migratedAt,
  migratedDatabase,
  migrationFolderUpTo,
  removeTempDir,
  temporaryDatabase,
} from './support/migrations'

/**
 * Isolated pre-cleanup fixture smoke test. Proves the shared helpers build
 * temporary SQLite files outside the repository, apply migrations through an
 * explicit tag, seed core plus disposable AI history, record the preserved
 * IDs/raw text/URLs, and clean up without touching the developer's `jobs.db`.
 */

function countRows(sqlite: Database, table: string): number {
  const row = sqlite.query(`SELECT count(*) AS count FROM ${table}`).get() as { count: number }
  return row.count
}

function tableNames(sqlite: Database): string[] {
  return sqlite
    .query("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map((row) => String((row as { name: string }).name))
}

describe('pre-cleanup fixture infrastructure', () => {
  test('applies migrations through an explicit tag and seeds preserve/reset data', () => {
    const folder = migrationFolderUpTo(19)
    const sqlite = migratedAt(folder)
    try {
      // The full current chain is applied through tag 19: Job Analysis run
      // columns (0017), run-scoped decisions (0018), and generation input
      // identity (0019) all exist.
      const analysisColumns = sqlite
        .query("PRAGMA table_info('job_posting_analyses')")
        .all()
        .map((row) => (row as { name: string }).name)
      expect(analysisColumns).toContain('status')
      expect(analysisColumns).toContain('queue_job_id')
      const generationColumns = sqlite
        .query("PRAGMA table_info('generation_runs')")
        .all()
        .map((row) => (row as { name: string }).name)
      expect(generationColumns).toContain('input_hash')
      expect(generationColumns).toContain('frozen_input_json')
      expect(tableNames(sqlite)).toContain('analysis_run_decisions')

      const fixture = seedPreCleanupFixture(sqlite)

      // Core preserved resources.
      expect(countRows(sqlite, 'companies')).toBe(2)
      expect(countRows(sqlite, 'contacts')).toBe(3)
      expect(countRows(sqlite, 'job_applications')).toBe(2)
      expect(countRows(sqlite, 'job_applications_to_contacts')).toBe(3)
      expect(countRows(sqlite, 'follow_ups')).toBe(2)
      expect(countRows(sqlite, 'interviews')).toBe(1)
      expect(countRows(sqlite, 'job_postings')).toBe(2)
      expect(countRows(sqlite, 'skills')).toBe(4)
      // Migration 0012 seeds all eleven canonical taxonomy categories; the
      // fixture records the subset its skills reference.
      expect(countRows(sqlite, 'skill_categories')).toBe(11)
      expect(fixture.categoryKeys).toHaveLength(4)
      expect(countRows(sqlite, 'skill_aliases')).toBe(3)
      expect(countRows(sqlite, 'google_drive_connections')).toBe(1)

      // Disposable derived AI history.
      expect(countRows(sqlite, 'job_posting_analyses')).toBe(2)
      expect(countRows(sqlite, 'job_requirements')).toBe(4)
      expect(countRows(sqlite, 'job_requirements_to_skills')).toBe(4)
      expect(countRows(sqlite, 'job_applications_to_skills')).toBe(4)
      expect(countRows(sqlite, 'application_analysis_runs')).toBe(1)
      expect(countRows(sqlite, 'analysis_run_decisions')).toBe(2)
      expect(countRows(sqlite, 'generation_runs')).toBe(1)
      expect(countRows(sqlite, 'generated_artifacts')).toBe(1)
      expect(countRows(sqlite, 'generation_evidence_snapshots')).toBe(1)
      expect(countRows(sqlite, 'generation_run_results')).toBe(1)
      expect(countRows(sqlite, 'document_reviews')).toBe(1)
      expect(countRows(sqlite, 'baseline_generation_runs')).toBe(1)
      expect(countRows(sqlite, 'baseline_generated_artifacts')).toBe(1)
      expect(countRows(sqlite, 'baseline_generation_evidence_snapshots')).toBe(1)

      // Recorded preserved facts that later migration tests must re-assert.
      expect(fixture.preservedApplications.map((a) => a.id)).toEqual(fixture.applicationIds)
      expect(fixture.preservedApplications[0].url).toBe('https://example.com/careers/frontend-123')
      expect(fixture.preservedApplications[0].jobTitle).toBe('Frontend Developer')
      expect(fixture.preservedApplications[1].url).toBe('https://second.example/jobs/backend-456')

      expect(fixture.preservedJobPostings).toHaveLength(2)
      expect(fixture.preservedJobPostings[0].rawText).toContain('Frontend Developer')
      expect(fixture.preservedJobPostings[0].contentHash).toBe('fixture-hash-frontend')
      expect(fixture.preservedJobPostings[1].contentHash).toBe('fixture-hash-backend')

      // The seeded fixture is referentially and structurally sound.
      expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
      expect(sqlite.query('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' })
    } finally {
      sqlite.close()
      removeTempDir(folder)
    }
  })

  test('seeds the fixture on the full repository migration chain', () => {
    const sqlite = migratedDatabase()
    try {
      const fixture = seedPreCleanupFixture(sqlite)

      expect(fixture.companyIds).toHaveLength(2)
      expect(fixture.contactIds).toHaveLength(3)
      expect(fixture.applicationIds).toHaveLength(2)
      expect(fixture.skillIds).toHaveLength(4)
      expect(fixture.preservedJobPostings[0].rawText).toContain('Frontend Developer')
      expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
      expect(sqlite.query('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' })
    } finally {
      sqlite.close()
    }
  })

  test('creates an isolated file-backed database outside the repository and cleans it up', () => {
    const temporary = temporaryDatabase()
    try {
      const repositoryRoot = process.cwd()
      expect(temporary.root.startsWith(tmpdir())).toBe(true)
      expect(temporary.filePath.startsWith(repositoryRoot)).toBe(false)
      expect(temporary.filePath.startsWith(temporary.root)).toBe(true)

      // Applying the full chain leaves a usable, file-backed database.
      migrate(drizzle({ client: temporary.sqlite }), { migrationsFolder: './drizzle' })
      expect(tableNames(temporary.sqlite)).toContain('job_applications')
      expect(existsSync(temporary.filePath)).toBe(true)
    } finally {
      temporary.cleanup()
    }

    // Cleanup removed the whole temporary directory, not just the database.
    expect(existsSync(temporary.root)).toBe(false)
  })
})
