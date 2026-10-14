import { Database } from 'bun:sqlite'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, relative, resolve } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'

/**
 * Bun test preload: the runtime authority for career facts is SQLite, so every
 * test process needs a migrated database and must never fall back to the
 * developer's `jobs.db`.
 *
 * - When `DB_FILE_NAME` is unset, a fresh temporary database outside the
 *   repository is created and exported for the process.
 * - When it is set to a path outside the repository (the isolated verification
 *   database), migrations are applied so identity reads and fire-and-forget
 *   workers see a schema.
 * - A path inside the repository (for example `jobs.db`) is left untouched: the
 *   suite never migrates or seeds the owner's operational database.
 */
const insideRepository = (target: string) => {
  const path = relative(resolve(process.cwd()), resolve(target))
  return path !== '' && !path.startsWith('..') && !isAbsolute(path)
}

let fileName = process.env.DB_FILE_NAME
if (!fileName) {
  fileName = resolve(mkdtempSync(resolve(tmpdir(), 'job-tracker-test-db-')), 'jobs.db')
  process.env.DB_FILE_NAME = fileName
}

if (!insideRepository(fileName)) {
  const sqlite = new Database(fileName, { create: true })
  try {
    sqlite.exec('PRAGMA foreign_keys = ON;')
    migrate(drizzle({ client: sqlite }), { migrationsFolder: './drizzle' })
  } finally {
    sqlite.close()
  }
}
