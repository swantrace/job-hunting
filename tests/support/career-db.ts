import { Database } from 'bun:sqlite'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, relative, resolve } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import * as schema from '../../src/db/schema'
import { applyCareerImport, prepareCareerImport } from '../../src/lib/career/import'
import {
  approvedBaseResumeManifest,
  approvedBaseResumeMarkdown,
  writeSyntheticCareerData,
} from '../career/fixtures'

/**
 * Database-backed career fixtures for the runtime read path.
 *
 * The runtime authority for career facts is SQLite, so tests must seed a
 * database rather than point `CAREER_DATA_DIR` at a directory. This module
 * builds temporary migrated databases outside the repository and seeds them from
 * the synthetic fixtures through the importer. It never opens the
 * developer's `jobs.db` or private `career-data/`.
 */

/** Refuses any database path inside the repository (for example `jobs.db`). */
function isolatedDatabaseFile(): string {
  const fileName = process.env.DB_FILE_NAME
  if (!fileName)
    throw new Error(
      'DB_FILE_NAME must point at a temporary database outside the repository before running career runtime tests.',
    )
  const path = relative(resolve(process.cwd()), resolve(fileName))
  if (path !== '' && !path.startsWith('..') && !isAbsolute(path))
    throw new Error(
      `DB_FILE_NAME resolves inside the repository (${path}); tests must use a temporary database outside it.`,
    )
  return fileName
}

export function testExecutor(sqlite: Database) {
  return drizzle({ client: sqlite, schema })
}

export type TestExecutor = ReturnType<typeof testExecutor>

export function migrateTestDatabase(sqlite: Database): void {
  sqlite.exec('PRAGMA foreign_keys = ON;')
  migrate(drizzle({ client: sqlite }), { migrationsFolder: './drizzle' })
}

/**
 * Applies the synthetic career dataset (documents, taxonomy and the approved
 * fullstack Base Resume) to an already-migrated database. Re-applying is
 * idempotent: fixture records are restored to their authored values.
 */
export function seedSyntheticCareerData(executor: TestExecutor): void {
  const root = mkdtempSync(resolve(tmpdir(), 'job-tracker-career-seed-'))
  try {
    const directory = resolve(root, 'career-data')
    writeSyntheticCareerData(directory)
    const baseDirectory = resolve(directory, 'base-resumes')
    mkdirSync(baseDirectory, { recursive: true })
    writeFileSync(
      resolve(baseDirectory, 'manifest.json'),
      `${JSON.stringify(approvedBaseResumeManifest(), null, 2)}\n`,
    )
    writeFileSync(resolve(baseDirectory, 'fullstack.md'), approvedBaseResumeMarkdown)
    const preview = prepareCareerImport(executor, { kind: 'directory', directory })
    if (preview.conflicts.length > 0)
      throw new Error(
        `Synthetic career fixtures reported conflicts: ${preview.conflicts.join(' ')}`,
      )
    applyCareerImport(executor, preview)
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
}

export type CareerTestDatabase = {
  sqlite: Database
  executor: TestExecutor
  cleanup: () => void
}

/**
 * Fresh file-backed temporary database outside the repository, migrated from
 * `drizzle/` and seeded with the synthetic fixtures. Use this when the code
 * under test accepts an explicit executor.
 */
export function createCareerTestDatabase(options: { seed?: boolean } = {}): CareerTestDatabase {
  const root = mkdtempSync(resolve(tmpdir(), 'job-tracker-career-db-'))
  const sqlite = new Database(resolve(root, 'career.db'), { create: true })
  migrateTestDatabase(sqlite)
  const executor = testExecutor(sqlite)
  if (options.seed !== false) seedSyntheticCareerData(executor)
  return {
    sqlite,
    executor,
    cleanup: () => {
      try {
        sqlite.close()
      } finally {
        rmSync(root, { force: true, recursive: true })
      }
    },
  }
}

/**
 * Migrates the suite's isolated `DB_FILE_NAME` database without seeding career
 * rows. Use this when a runtime function reads the database only for an identity
 * (catalog/category fingerprint) and no career facts are needed.
 */
export function migrateCareerTestDatabase(): { sqlite: Database; executor: TestExecutor } {
  const fileName = isolatedDatabaseFile()
  const sqlite = new Database(fileName, { create: true })
  migrateTestDatabase(sqlite)
  return { sqlite, executor: testExecutor(sqlite) }
}

/**
 * Migrates and seeds the suite's isolated `DB_FILE_NAME` database, then returns
 * an executor for it. Runtime modules resolve `db` from `DB_FILE_NAME` at import
 * time, so seeding this file is what makes `loadCareerData()`, `listDirections()`
 * and the enqueue builders read career facts. Throws when `DB_FILE_NAME` is
 * unset so a test can never fall back to the repository's `jobs.db`.
 */
export function careerTestDatabase(): CareerTestDatabase {
  const fileName = isolatedDatabaseFile()
  const sqlite = new Database(fileName, { create: true })
  migrateTestDatabase(sqlite)
  const executor = testExecutor(sqlite)
  seedSyntheticCareerData(executor)
  return { sqlite, executor, cleanup: () => sqlite.close() }
}
