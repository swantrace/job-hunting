import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { migratedDatabase } from '../support/sqlite'

const baselineMigrationIndex = 10

function database(migrationsFolder: string) {
  const sqlite = new Database(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON;')
  migrate(drizzle({ client: sqlite }), { migrationsFolder })
  return sqlite
}

function createBaselineMigrationFolder(lastMigrationIndex = baselineMigrationIndex) {
  const root = mkdtempSync(resolve(tmpdir(), 'job-tracker-baseline-migrations-'))
  const metaDirectory = resolve(root, 'meta')
  mkdirSync(metaDirectory)
  for (let index = 0; index <= lastMigrationIndex; index += 1) {
    const prefix = `${String(index).padStart(4, '0')}_`
    const fileName = Array.from(new Bun.Glob(`${prefix}*.sql`).scanSync('drizzle'))[0]
    if (!fileName) throw new Error(`Missing baseline migration with prefix ${prefix}.`)
    cpSync(resolve('drizzle', fileName), resolve(root, fileName))
  }
  const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')) as {
    entries: Array<{ idx: number }>
  }
  journal.entries = journal.entries.filter((entry) => entry.idx <= lastMigrationIndex)
  writeFileSync(resolve(metaDirectory, '_journal.json'), JSON.stringify(journal))
  return root
}

describe('canonical skill storage', () => {
  test('applies the complete migration history and drops the legacy application-skill table', () => {
    const sqlite = database('./drizzle')
    try {
      const tables = sqlite
        .query("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((row) => String((row as { name: string }).name))
      expect(tables).toContain('skills')
      expect(tables).toContain('job_requirements_to_skills')
      expect(tables).toContain('job_postings')
      expect(tables).not.toContain('job_applications_to_skills')
    } finally {
      sqlite.close()
    }
  })

  test('preserves canonical category keys and enforces the taxonomy foreign key', () => {
    const canonicalSkillFolder = createBaselineMigrationFolder(11)
    const sqlite = database(canonicalSkillFolder)
    try {
      const skill = sqlite
        .query(
          `INSERT INTO skills (key, name, category, review_status, origin, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        )
        .get(
          'react',
          'React',
          'frontend',
          'approved',
          'career-data',
          '2026-08-28',
          '2026-08-28',
        ) as {
        id: number
      }
      migrate(drizzle({ client: sqlite }), { migrationsFolder: './drizzle' })
      expect(sqlite.query('SELECT category FROM skills WHERE id = ?').get(skill.id)).toEqual({
        category: 'frontend',
      })
      expect(() =>
        sqlite.query('UPDATE skills SET category = ? WHERE id = ?').run('not-configured', skill.id),
      ).toThrow()
    } finally {
      sqlite.close()
      rmSync(canonicalSkillFolder, { force: true, recursive: true })
    }
  })

  test('preserves merged skill relationships through the contract migration', () => {
    const canonicalSkillFolder = createBaselineMigrationFolder(11)
    const sqlite = database(canonicalSkillFolder)
    try {
      const target = sqlite
        .query(
          `INSERT INTO skills (key, name, category, review_status, origin, career_skill_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        )
        .get(
          'react',
          'React',
          'frontend',
          'approved',
          'career-data',
          'react',
          '2026-08-28',
          '2026-08-28',
        ) as {
        id: number
      }
      const merged = sqlite
        .query(
          `INSERT INTO skills (key, name, category, review_status, origin, merged_into_skill_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        )
        .get(
          'reactjs',
          'React.js',
          'frontend',
          'merged',
          'job-parser',
          target.id,
          '2026-08-28',
          '2026-08-28',
        ) as { id: number }
      migrate(drizzle({ client: sqlite }), { migrationsFolder: './drizzle' })
      expect(
        sqlite
          .query('SELECT review_status, merged_into_skill_id FROM skills WHERE id = ?')
          .get(merged.id),
      ).toEqual({ review_status: 'merged', merged_into_skill_id: target.id })
      expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
    } finally {
      sqlite.close()
      rmSync(canonicalSkillFolder, { force: true, recursive: true })
    }
  })

  test('keeps requirement-skill mappings intact after the full chain', () => {
    const sqlite = migratedDatabase()
    try {
      const tables = sqlite
        .query("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((row) => String((row as { name: string }).name))
      expect(tables).toContain('job_requirements_to_skills')
      expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
      expect(sqlite.query('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' })
    } finally {
      sqlite.close()
    }
  })
})
