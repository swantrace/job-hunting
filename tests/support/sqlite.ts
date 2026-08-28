import { Database } from 'bun:sqlite'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'

/**
 * Reusable temporary-database helpers for the skill intelligence test suite.
 * Tests must never touch the developer's `jobs.db` or private `career-data/`;
 * these helpers build isolated in-memory databases or temporary migration
 * folders seeded with the checked-in example shapes.
 */

export const baselineMigrationIndex = 10

export function migratedDatabase(migrationsFolder = './drizzle') {
  const sqlite = new Database(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON;')
  migrate(drizzle({ client: sqlite }), { migrationsFolder })
  return sqlite
}

/**
 * Builds a temporary migration folder containing only migrations 0..10, so a
 * test can seed the legacy two-column `skills` table and then apply the full
 * `./drizzle` directory to prove relationships survive the future migration.
 */
export function createBaselineMigrationFolder() {
  const root = mkdtempSync(resolve(tmpdir(), 'job-tracker-baseline-migrations-'))
  const metaDirectory = resolve(root, 'meta')
  mkdirSync(metaDirectory)

  for (let index = 0; index <= baselineMigrationIndex; index += 1) {
    const prefix = `${String(index).padStart(4, '0')}_`
    const fileName = Array.from(new Bun.Glob(`${prefix}*.sql`).scanSync('drizzle'))[0]
    if (!fileName) throw new Error(`Missing baseline migration with prefix ${prefix}.`)
    cpSync(resolve('drizzle', fileName), resolve(root, fileName))
  }

  const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')) as {
    entries: Array<{ idx: number }>
  }
  journal.entries = journal.entries.filter((entry) => entry.idx <= baselineMigrationIndex)
  writeFileSync(resolve(metaDirectory, '_journal.json'), JSON.stringify(journal))
  return root
}

export function removeTempDir(root: string) {
  rmSync(root, { force: true, recursive: true })
}

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
