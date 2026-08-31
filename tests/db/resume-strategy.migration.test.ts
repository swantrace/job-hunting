import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import {
  migratedAt,
  migratedDatabase,
  migrationFolderUpTo,
  removeTempDir,
} from './support/migrations'

function seedCompletedRun(sqlite: Database, queueJobId: string) {
  const company = sqlite
    .query('INSERT INTO companies (name, created_at, updated_at) VALUES (?, ?, ?) RETURNING id')
    .get('Example', '2026-01-01', '2026-01-01') as { id: number }
  const application = sqlite
    .query(
      `INSERT INTO job_applications (
        company_id, job_title, direction, posted_date, priority, status, created_at, updated_at
      ) VALUES (?, 'Engineer', 'fullstack', '2026-01-01', 'B', 'Saved', '2026-01-01', '2026-01-01') RETURNING id`,
    )
    .get(company.id) as { id: number }
  const posting = sqlite
    .query(
      `INSERT INTO job_postings (job_application_id, raw_text, captured_at, content_hash)
       VALUES (?, 'Role.', '2026-01-01', ?) RETURNING id`,
    )
    .get(application.id, `hash-${queueJobId}`) as { id: number }
  const analysis = sqlite
    .query(
      `INSERT INTO job_posting_analyses (job_posting_id, status, created_at, updated_at, completed_at)
       VALUES (?, 'Completed', '2026-01-01', '2026-01-01', '2026-01-01') RETURNING id`,
    )
    .get(posting.id) as { id: number }
  const run = sqlite
    .query(
      `INSERT INTO application_analysis_runs (
        job_posting_analysis_id, status, queue_job_id, confirmed_profile_id, created_at, updated_at, completed_at
      ) VALUES (?, 'Completed', ?, 'fullstack', '2026-01-01', '2026-01-01', '2026-01-01') RETURNING id`,
    )
    .get(analysis.id, queueJobId) as { id: number }
  return { applicationId: application.id, analysisId: analysis.id, runId: run.id }
}

describe('resume strategy migration', () => {
  test('creates the run-scoped strategy table on an empty database', () => {
    const sqlite = migratedDatabase()
    try {
      const tables = sqlite
        .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
        .all('analysis_run_resume_strategies')
      expect(tables).toHaveLength(1)
      expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
      expect(sqlite.query('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' })
    } finally {
      sqlite.close()
    }
  })

  test('preserves a populated run and enforces the unique FK with cascade', () => {
    const folder = migrationFolderUpTo(22)
    const sqlite = migratedAt(folder)
    try {
      const seeded = seedCompletedRun(sqlite, 'analysis-1')
      migrate(drizzle({ client: sqlite }), { migrationsFolder: './drizzle' })

      // The existing run survives the forward-only migration.
      expect(
        sqlite
          .query('SELECT confirmed_profile_id FROM application_analysis_runs WHERE id = ?')
          .get(seeded.runId),
      ).toEqual({ confirmed_profile_id: 'fullstack' })

      sqlite
        .query(
          `INSERT INTO analysis_run_resume_strategies (
            application_analysis_run_id, positioning, primary_themes, emphasize_evidence_ids, deemphasize_evidence_ids, created_at, updated_at
          ) VALUES (?, 'Positioning', '["TypeScript"]', '["skill:typescript"]', '[]', '2026-01-01', '2026-01-01')`,
        )
        .run(seeded.runId)

      // A second strategy for the same run violates the unique FK.
      expect(() =>
        sqlite
          .query(
            `INSERT INTO analysis_run_resume_strategies (
              application_analysis_run_id, positioning, primary_themes, emphasize_evidence_ids, deemphasize_evidence_ids, created_at, updated_at
            ) VALUES (?, 'Duplicate', '["TypeScript"]', '[]', '[]', '2026-01-01', '2026-01-01')`,
          )
          .run(seeded.runId),
      ).toThrow()

      // Deleting the run cascades to its strategy.
      sqlite.query('DELETE FROM application_analysis_runs WHERE id = ?').run(seeded.runId)
      expect(
        sqlite.query('SELECT count(*) AS count FROM analysis_run_resume_strategies').get(),
      ).toEqual({ count: 0 })

      expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
      expect(sqlite.query('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' })
    } finally {
      sqlite.close()
      removeTempDir(folder)
    }
  })
})
