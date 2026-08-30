import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { saveJobPostingVersion } from '../../src/db/job-analysis-runs'
import * as schema from '../../src/db/schema'
import { migratedDatabase } from '../support/sqlite'

/**
 * Immutable Job Post version contract: changed raw text creates the next
 * version, identical normalized text reuses the current version, and the
 * current selection is deterministic by version then ID.
 */

function seedApplication(sqlite: Database): number {
  const company = sqlite
    .query('INSERT INTO companies (name, created_at, updated_at) VALUES (?, ?, ?) RETURNING id')
    .get('Example Company', '2026-08-28', '2026-08-28') as { id: number }
  const application = sqlite
    .query(
      `INSERT INTO job_applications (
        company_id, job_title, direction, posted_date, priority, status, created_at, updated_at
      ) VALUES (?, 'Engineer', 'fullstack', '2026-08-28', 'B', 'Saved', '2026-08-28', '2026-08-28') RETURNING id`,
    )
    .get(company.id) as { id: number }
  return application.id
}

describe('immutable job post versions', () => {
  test('creates the next version for changed text and reuses identical text', () => {
    const sqlite = migratedDatabase()
    try {
      const db = drizzle({ client: sqlite, schema })
      const applicationId = seedApplication(sqlite)

      const first = saveJobPostingVersion(db, applicationId, 'A job posting with enough text.')
      expect(first.reused).toBe(false)
      const second = saveJobPostingVersion(db, applicationId, 'A job posting with enough text.')
      expect(second.reused).toBe(true)
      expect(second.jobPostingId).toBe(first.jobPostingId)

      const third = saveJobPostingVersion(
        db,
        applicationId,
        'A different job posting with enough text.',
      )
      expect(third.reused).toBe(false)
      expect(third.jobPostingId).not.toBe(first.jobPostingId)

      const versions = sqlite
        .query('SELECT version FROM job_postings WHERE job_application_id = ? ORDER BY version')
        .all(applicationId)
        .map((row) => Number((row as { version: number }).version))
      expect(versions).toEqual([1, 2])
      expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
    } finally {
      sqlite.close()
    }
  })
})
