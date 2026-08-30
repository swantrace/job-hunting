import { Database } from 'bun:sqlite'
import {
  createBaselineMigrationFolder,
  migratedDatabase,
  removeTempDir,
} from '../db/support/migrations'

/**
 * Reusable temporary-database helpers for the skill intelligence test suite.
 * Tests must never touch the developer's `jobs.db` or private `career-data/`;
 * these helpers build isolated in-memory databases or temporary migration
 * folders seeded with the checked-in example shapes. Migration/folder helpers
 * are re-exported from `tests/db/support/migrations.ts`.
 */

export const baselineMigrationIndex = 10

export { createBaselineMigrationFolder, migratedDatabase, removeTempDir }

export function seedApplication(sqlite: Database, jobTitle = 'Software Engineer') {
  const company = sqlite
    .query('INSERT INTO companies (name, created_at) VALUES (?, ?) RETURNING id')
    .get('Example Company', '2026-08-28') as { id: number }
  const application = sqlite
    .query(
      `INSERT INTO job_applications (
        company_id, job_title, direction, posted_date, priority, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .get(
      company.id,
      jobTitle,
      'fullstack',
      '2026-08-28',
      'B',
      'Saved',
      '2026-08-28',
      '2026-08-28',
    ) as { id: number }
  return { applicationId: application.id, companyId: company.id }
}

export function seedLegacySkill(sqlite: Database, name: string) {
  return sqlite.query('INSERT INTO skills (name) VALUES (?) RETURNING id').get(name) as {
    id: number
  }
}
