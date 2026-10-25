import type { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import {
  migratedAt,
  migratedDatabase,
  migrationFolderUpTo,
  removeTempDir,
} from './support/migrations'

/**
 * Migration 0030 contract: the orphan `analysis_run_resume_strategies` table is
 * dropped.
 *
 * The table came from `0023_run_scoped_resume_strategies.sql` and the removed
 * `src/db/resume-strategy.ts`. When the chain was renumbered, `0023` became
 * `0023_base_grounded_drafts` and the old migration disappeared, so nothing drops
 * the table: databases migrated by the older chain (production) still carry it,
 * while databases built from the current chain never had it. 0030 has to converge
 * both, which is why it uses `DROP TABLE IF EXISTS`.
 */

const orphanTable = 'analysis_run_resume_strategies'

function tableNames(sqlite: Database): string[] {
  return sqlite
    .query(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations'",
    )
    .all()
    .map((row) => String((row as { name: string }).name))
}

describe('migration 0030 contract', () => {
  test('a database still carrying the orphan table loses it', () => {
    const folder = migrationFolderUpTo(29)
    try {
      const sqlite = migratedAt(folder)
      sqlite.exec(`CREATE TABLE \`${orphanTable}\` (id text primary key, payload_json text)`)
      expect(tableNames(sqlite)).toContain(orphanTable)
      expect(tableNames(sqlite)).toHaveLength(37)

      migrate(drizzle({ client: sqlite }), { migrationsFolder: './drizzle' })

      expect(tableNames(sqlite)).not.toContain(orphanTable)
      expect(tableNames(sqlite)).toHaveLength(39)
      expect(sqlite.query('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' })
      expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
      sqlite.close()
    } finally {
      removeTempDir(folder)
    }
  })

  test('a database built from the current chain never gains it', () => {
    const sqlite = migratedDatabase()
    const names = tableNames(sqlite)
    expect(names).not.toContain(orphanTable)
    expect(names).toHaveLength(39)
    sqlite.close()
  })
})
