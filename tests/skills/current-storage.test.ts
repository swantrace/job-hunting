import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import * as schema from '../../src/db/schema'
import { persistSkillRequirements } from '../../src/db/skill-queries'
import { migratedDatabase } from '../support/sqlite'

const baselineMigrationIndex = 10

type SeededApplication = {
  applicationId: number
  companyId: number
}

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

function seedApplication(sqlite: Database): SeededApplication {
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
      'Software Engineer',
      'fullstack',
      '2026-08-28',
      'B',
      'Saved',
      '2026-08-28',
      '2026-08-28',
    ) as { id: number }
  return { applicationId: application.id, companyId: company.id }
}

describe('existing skill storage migration baseline', () => {
  test('applies the complete migration history to an isolated database', () => {
    const sqlite = database('./drizzle')
    try {
      const tables = sqlite
        .query("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((row) => String((row as { name: string }).name))

      expect(tables).toContain('skills')
      expect(tables).toContain('job_applications_to_skills')
      expect(tables).toContain('job_postings')
      expect(tables).toContain('generation_runs')
    } finally {
      sqlite.close()
    }
  })

  test('preserves a legacy application-to-skill relationship through future migrations', () => {
    const baselineFolder = createBaselineMigrationFolder()
    const sqlite = database(baselineFolder)
    try {
      const { applicationId } = seedApplication(sqlite)
      const skill = sqlite
        .query('INSERT INTO skills (name) VALUES (?) RETURNING id')
        .get('TypeScript') as { id: number }
      sqlite
        .query(
          'INSERT INTO job_applications_to_skills (job_application_id, skill_id) VALUES (?, ?)',
        )
        .run(applicationId, skill.id)

      migrate(drizzle({ client: sqlite }), { migrationsFolder: './drizzle' })

      const relationship = sqlite
        .query(
          `SELECT s.name
           FROM job_applications_to_skills AS relation
           JOIN skills AS s ON s.id = relation.skill_id
           WHERE relation.job_application_id = ?`,
        )
        .get(applicationId) as { name: string }
      expect(relationship.name).toBe('TypeScript')
    } finally {
      sqlite.close()
      rmSync(baselineFolder, { force: true, recursive: true })
    }
  })

  test('currently prevents case-only duplicates and duplicate application relations', () => {
    const baselineFolder = createBaselineMigrationFolder()
    const sqlite = database(baselineFolder)
    try {
      const { applicationId } = seedApplication(sqlite)
      const skill = sqlite
        .query('INSERT INTO skills (name) VALUES (?) RETURNING id')
        .get('React') as { id: number }

      expect(() => sqlite.query('INSERT INTO skills (name) VALUES (?)').run('react')).toThrow()
      sqlite
        .query(
          'INSERT INTO job_applications_to_skills (job_application_id, skill_id) VALUES (?, ?)',
        )
        .run(applicationId, skill.id)
      expect(() =>
        sqlite
          .query(
            'INSERT INTO job_applications_to_skills (job_application_id, skill_id) VALUES (?, ?)',
          )
          .run(applicationId, skill.id),
      ).toThrow()
    } finally {
      sqlite.close()
      rmSync(baselineFolder, { force: true, recursive: true })
    }
  })

  test('documents that semantic aliases are not deduplicated by the legacy schema', () => {
    const baselineFolder = createBaselineMigrationFolder()
    const sqlite = database(baselineFolder)
    try {
      sqlite.query('INSERT INTO skills (name) VALUES (?)').run('Node.js')
      sqlite.query('INSERT INTO skills (name) VALUES (?)').run('nodejs')

      const count = sqlite.query('SELECT count(*) AS count FROM skills').get() as { count: number }
      expect(count.count).toBe(2)
    } finally {
      sqlite.close()
      rmSync(baselineFolder, { force: true, recursive: true })
    }
  })

  test('stores all 30 structured parser requirements without the legacy 20-skill truncation', () => {
    const sqlite = migratedDatabase()
    const db = drizzle({ client: sqlite, schema })
    try {
      const { applicationId } = seedApplication(sqlite)
      const requirements = Array.from({ length: 30 }, (_, index) => ({
        rawLabel: `Skill ${index}`,
        canonicalLabel: `skill-${index}`,
        category: 'languages-web' as const,
        importance: 'required' as const,
        sourceText: `Requires skill ${index}`,
        confidence: 0.9,
      }))
      persistSkillRequirements(db, applicationId, requirements)

      const count = sqlite
        .query(
          'SELECT count(*) AS count FROM job_applications_to_skills WHERE job_application_id = ?',
        )
        .get(applicationId) as { count: number }
      expect(count.count).toBe(30)
    } finally {
      sqlite.close()
    }
  })

  test('preserves canonical category keys while adding the taxonomy foreign key', () => {
    const canonicalSkillFolder = createBaselineMigrationFolder(11)
    const sqlite = database(canonicalSkillFolder)
    try {
      const skill = sqlite
        .query(
          `INSERT INTO skills (
            key, name, category, review_status, origin, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        )
        .get(
          'react',
          'React',
          'frontend',
          'approved',
          'career-data',
          '2026-08-28',
          '2026-08-28',
        ) as { id: number }

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

  test('preserves merged skill relationships while replacing the legacy skills table', () => {
    const canonicalSkillFolder = createBaselineMigrationFolder(11)
    const sqlite = database(canonicalSkillFolder)
    try {
      const target = sqlite
        .query(
          `INSERT INTO skills (
            key, name, category, review_status, origin, career_skill_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
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
        ) as { id: number }
      const merged = sqlite
        .query(
          `INSERT INTO skills (
            key, name, category, review_status, origin, merged_into_skill_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
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
})
