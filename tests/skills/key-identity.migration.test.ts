import { describe, expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { createBaselineMigrationFolder, migratedAt, removeTempDir } from '../db/support/migrations'

describe('key-only skill identity migration', () => {
  test('preserves core job data while resetting skills and derived AI history', () => {
    const beforeFolder = createBaselineMigrationFolder(21)
    const sqlite = migratedAt(beforeFolder)
    try {
      sqlite
        .query(
          `INSERT INTO companies (name, created_at, updated_at)
           VALUES ('Acme', '2026-08-30', '2026-08-30')`,
        )
        .run()
      const application = sqlite
        .query(
          `INSERT INTO job_applications
            (company_id, job_title, posted_date, priority, status, created_at, updated_at)
           VALUES (1, 'Engineer', '2026-08-30', 'B', 'Saved', '2026-08-30', '2026-08-30')
           RETURNING id`,
        )
        .get() as { id: number }
      const posting = sqlite
        .query(
          `INSERT INTO job_postings
            (job_application_id, version, raw_text, captured_at, content_hash)
           VALUES (?, 1, 'Original job post', '2026-08-30', 'hash-1') RETURNING id`,
        )
        .get(application.id) as { id: number }
      sqlite
        .query(
          `INSERT INTO job_posting_analyses
            (job_posting_id, status, attempts, completed_at, created_at, updated_at)
           VALUES (?, 'Completed', 1, '2026-08-30', '2026-08-30', '2026-08-30')`,
        )
        .run(posting.id)
      sqlite
        .query(
          `INSERT INTO skills
            (key, name, review_status, origin, career_skill_id, created_at, updated_at)
           VALUES ('react', 'React', 'approved', 'career-data', 'react', '2026-08-30', '2026-08-30')`,
        )
        .run()

      migrate(drizzle({ client: sqlite }), { migrationsFolder: './drizzle' })

      expect(sqlite.query('SELECT job_title FROM job_applications').get()).toEqual({
        job_title: 'Engineer',
      })
      expect(sqlite.query('SELECT raw_text FROM job_postings').get()).toEqual({
        raw_text: 'Original job post',
      })
      expect(sqlite.query('SELECT count(*) AS count FROM skills').get()).toEqual({ count: 0 })
      expect(sqlite.query('SELECT count(*) AS count FROM job_posting_analyses').get()).toEqual({
        count: 0,
      })
      const columns = sqlite
        .query("SELECT name FROM pragma_table_info('skills')")
        .all()
        .map((row) => (row as { name: string }).name)
      expect(columns).not.toContain('career_skill_id')
      expect(columns).toContain('key')
    } finally {
      sqlite.close()
      removeTempDir(beforeFolder)
    }
  })
})
