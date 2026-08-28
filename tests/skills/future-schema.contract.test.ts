import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { getTableColumns } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { skills } from '../../src/db/schema'

const futureSkillColumns = getTableColumns(skills) as Record<string, unknown>
const futureSchemaImplemented = 'key' in futureSkillColumns && 'reviewStatus' in futureSkillColumns
const futureSchemaTest = futureSchemaImplemented ? test : test.todo

function migratedDatabase() {
  const sqlite = new Database(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON;')
  migrate(drizzle({ client: sqlite }), { migrationsFolder: './drizzle' })
  return sqlite
}

function seedFutureSkill(sqlite: Database) {
  return sqlite
    .query(
      `INSERT INTO skills (
        key, name, category, review_status, origin, career_skill_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .get(
      'nodejs',
      'Node.js',
      'backend-apis',
      'approved',
      'career-data',
      'nodejs',
      '2026-08-28',
      '2026-08-28',
    ) as { id: number }
}

function seedApplication(sqlite: Database) {
  const company = sqlite
    .query('INSERT INTO companies (name, created_at) VALUES (?, ?) RETURNING id')
    .get('Example Company', '2026-08-28') as { id: number }
  return sqlite
    .query(
      `INSERT INTO job_applications (
        company_id, job_title, direction, posted_date, priority, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .get(
      company.id,
      'Platform Engineer',
      'fullstack',
      '2026-08-28',
      'B',
      'Saved',
      '2026-08-28',
      '2026-08-28',
    ) as { id: number }
}

describe('planned SQLite skill taxonomy constraints', () => {
  futureSchemaTest('creates canonical skill and alias columns with text dates', () => {
    const sqlite = migratedDatabase()
    try {
      const skillColumns = sqlite
        .query("SELECT name, type FROM pragma_table_info('skills')")
        .all() as Array<{ name: string; type: string }>
      const aliasColumns = sqlite
        .query("SELECT name, type FROM pragma_table_info('skill_aliases')")
        .all() as Array<{ name: string; type: string }>

      for (const name of [
        'key',
        'category',
        'review_status',
        'origin',
        'career_skill_id',
        'merged_into_skill_id',
        'created_at',
        'updated_at',
      ]) {
        expect(skillColumns.map((column) => column.name)).toContain(name)
      }
      expect(aliasColumns.map((column) => column.name)).toEqual(
        expect.arrayContaining(['skill_id', 'alias', 'normalized_alias', 'origin', 'created_at']),
      )
      expect(skillColumns.find((column) => column.name === 'created_at')?.type).toBe('TEXT')
      expect(aliasColumns.find((column) => column.name === 'created_at')?.type).toBe('TEXT')
    } finally {
      sqlite.close()
    }
  })

  futureSchemaTest('enforces globally unique normalized aliases', () => {
    const sqlite = migratedDatabase()
    try {
      const skill = seedFutureSkill(sqlite)
      sqlite
        .query(
          `INSERT INTO skill_aliases (skill_id, alias, normalized_alias, origin, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(skill.id, 'Node.JS', 'node.js', 'career-data', '2026-08-28')

      expect(() =>
        sqlite
          .query(
            `INSERT INTO skill_aliases (skill_id, alias, normalized_alias, origin, created_at)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .run(skill.id, ' node.js ', 'node.js', 'manual', '2026-08-28'),
      ).toThrow()
    } finally {
      sqlite.close()
    }
  })

  futureSchemaTest(
    'rejects Include relationships without a decision reason at database level',
    () => {
      const sqlite = migratedDatabase()
      try {
        const application = seedApplication(sqlite)
        const skill = seedFutureSkill(sqlite)

        expect(() =>
          sqlite
            .query(
              `INSERT INTO job_applications_to_skills (
              job_application_id, skill_id, raw_label, importance, analysis_result,
              user_decision, decision_reason, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              application.id,
              skill.id,
              'Node.js',
              'required',
              'not-in-career-data',
              'include',
              '',
              '2026-08-28',
              '2026-08-28',
            ),
        ).toThrow()
      } finally {
        sqlite.close()
      }
    },
  )
})
