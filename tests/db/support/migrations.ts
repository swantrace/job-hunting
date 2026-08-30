import { Database } from 'bun:sqlite'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'

/**
 * Reusable migration and temporary-database helpers for the canonical database
 * cleanup suite. These helpers build isolated SQLite files in temporary
 * directories outside the repository and never open the developer's `jobs.db`
 * or the repository's default database.
 */

export const defaultMigrationsFolder = './drizzle'

/** The last migration index of the legacy pre-canonical-skills schema. */
export const baselineMigrationIndex = 10

interface JournalFile {
  entries: Array<{ idx: number }>
}

function migrationPrefix(index: number): string {
  return `${String(index).padStart(4, '0')}_`
}

function findMigrationFile(index: number, sourceFolder: string): string {
  const prefix = migrationPrefix(index)
  const fileName = Array.from(new Bun.Glob(`${prefix}*.sql`).scanSync(sourceFolder))[0]
  if (!fileName) throw new Error(`Missing migration with prefix ${prefix} in ${sourceFolder}.`)
  return fileName
}

export interface MigrationFolderOptions {
  sourceFolder?: string
  tempPrefix?: string
}

/**
 * Copies migrations 0..`lastIndex` (inclusive) and a matching filtered journal
 * into a fresh temporary directory outside the repository. Applying this folder
 * migrates a database through exactly that explicit tag.
 */
export function migrationFolderUpTo(
  lastIndex: number,
  options: MigrationFolderOptions = {},
): string {
  const sourceFolder = options.sourceFolder ?? defaultMigrationsFolder
  const tempPrefix = options.tempPrefix ?? 'job-tracker-migrations-'
  const root = mkdtempSync(resolve(tmpdir(), tempPrefix))
  const metaDirectory = resolve(root, 'meta')
  mkdirSync(metaDirectory)

  for (let index = 0; index <= lastIndex; index += 1) {
    const fileName = findMigrationFile(index, sourceFolder)
    cpSync(resolve(sourceFolder, fileName), resolve(root, fileName))
  }

  const journalPath = resolve(sourceFolder, 'meta', '_journal.json')
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as JournalFile
  journal.entries = journal.entries.filter((entry) => entry.idx <= lastIndex)
  writeFileSync(resolve(metaDirectory, '_journal.json'), JSON.stringify(journal))
  return root
}

/**
 * Builds a temporary migration folder containing only the legacy 0..10 schema,
 * so a test can seed the two-column `skills` table and then apply the full
 * `./drizzle` directory to prove relationships survive the future migrations.
 */
export function createBaselineMigrationFolder(
  lastIndex = baselineMigrationIndex,
  sourceFolder = defaultMigrationsFolder,
): string {
  return migrationFolderUpTo(lastIndex, {
    sourceFolder,
    tempPrefix: 'job-tracker-baseline-migrations-',
  })
}

/** Opens an in-memory SQLite database and applies every migration in `folder`. */
export function migratedDatabase(migrationsFolder = defaultMigrationsFolder): Database {
  const sqlite = new Database(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON;')
  migrate(drizzle({ client: sqlite }), { migrationsFolder })
  return sqlite
}

/** Applies the migrations in a temporary folder built by {@link migrationFolderUpTo}. */
export function migratedAt(folder: string): Database {
  return migratedDatabase(folder)
}

export function removeTempDir(root: string): void {
  rmSync(root, { force: true, recursive: true })
}

export interface TemporaryDatabase {
  sqlite: Database
  filePath: string
  root: string
  cleanup: () => void
}

/**
 * Opens a file-backed SQLite database in a fresh temporary directory outside
 * the repository. The returned `cleanup` closes the database and removes the
 * whole directory, proving no repository file is left behind.
 */
export function temporaryDatabase(
  options: { fileName?: string; tempPrefix?: string } = {},
): TemporaryDatabase {
  const root = mkdtempSync(resolve(tmpdir(), options.tempPrefix ?? 'job-tracker-temp-db-'))
  const filePath = resolve(root, options.fileName ?? 'jobs.db')
  const sqlite = new Database(filePath, { create: true })
  sqlite.exec('PRAGMA foreign_keys = ON;')
  return {
    sqlite,
    filePath,
    root,
    cleanup: () => {
      try {
        sqlite.close()
      } finally {
        rmSync(root, { force: true, recursive: true })
      }
    },
  }
}
