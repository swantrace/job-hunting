import { describe, expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from '../../src/db/schema'
import { mergeSkills } from '../../src/db/skill-service'
import { type CareerSkillsInput, syncCareerSkills } from '../../src/lib/skills/sync-career-skills'
import { migratedDatabase } from '../support/sqlite'

function database() {
  const sqlite = migratedDatabase()
  return { sqlite, db: drizzle({ client: sqlite, schema }) }
}

function careerSkills(skills: CareerSkillsInput['skills']['skills']): CareerSkillsInput {
  return { skills: { skills } }
}

function seedJdSkill(sqlite: ReturnType<typeof database>['sqlite'], key: string, name: string) {
  return sqlite
    .query(
      `INSERT INTO skills (key, name, category, review_status, origin, created_at, updated_at)
       VALUES (?, ?, NULL, 'pending', 'job-parser', '2026-08-28', '2026-08-28') RETURNING id`,
    )
    .get(key, name) as { id: number }
}

describe('career skill synchronization', () => {
  test('links a later career skill to a JD-discovered pending skill', () => {
    const { sqlite, db } = database()
    try {
      const jdSkill = seedJdSkill(sqlite, 'kafka', 'Apache Kafka')
      const report = syncCareerSkills(
        db,
        careerSkills([{ id: 'kafka', label: 'Kafka', category: 'messaging-async', aliases: [] }]),
        { apply: true },
      )

      expect(report.linked).toBe(1)
      expect(report.inserted).toBe(0)
      const row = sqlite
        .query('SELECT career_skill_id, review_status, name, key FROM skills WHERE id = ?')
        .get(jdSkill.id) as {
        career_skill_id: string | null
        review_status: string
        name: string
        key: string
      }
      expect(row.career_skill_id).toBe('kafka')
      expect(row.review_status).toBe('approved')
      expect(row.name).toBe('Kafka')
      expect(row.key).toBe('kafka')
    } finally {
      sqlite.close()
    }
  })

  test('leaves JD-only taxonomy skills untouched', () => {
    const { sqlite, db } = database()
    try {
      const jenkins = seedJdSkill(sqlite, 'jenkins', 'Jenkins')
      syncCareerSkills(
        db,
        careerSkills([{ id: 'kafka', label: 'Kafka', category: 'messaging-async', aliases: [] }]),
        { apply: true },
      )

      const row = sqlite
        .query('SELECT career_skill_id, review_status, origin FROM skills WHERE id = ?')
        .get(jenkins.id) as {
        career_skill_id: string | null
        review_status: string
        origin: string
      }
      expect(row.career_skill_id).toBeNull()
      expect(row.review_status).toBe('pending')
      expect(row.origin).toBe('job-parser')
    } finally {
      sqlite.close()
    }
  })

  test('is idempotent across repeated applies', () => {
    const { sqlite, db } = database()
    try {
      const skills = careerSkills([
        { id: 'kafka', label: 'Kafka', category: 'messaging-async', aliases: ['Apache Kafka'] },
      ])
      const first = syncCareerSkills(db, skills, { apply: true })
      const second = syncCareerSkills(db, skills, { apply: true })

      expect(first.inserted).toBe(1)
      expect(second.inserted).toBe(0)
      expect(second.linked).toBe(0)
      expect(second.updated).toBe(0)
      expect(second.unchanged).toBe(1)
      expect(
        sqlite.query('SELECT count(*) AS count FROM skills').get() as { count: number },
      ).toEqual({ count: 1 })
    } finally {
      sqlite.close()
    }
  })

  test('never resolves a career skill to a merged skill', () => {
    const { sqlite, db } = database()
    try {
      const target = sqlite
        .query(
          `INSERT INTO skills (key, name, review_status, origin, created_at, updated_at)
           VALUES ('react', 'react', 'pending', 'manual', '2026-08-28', '2026-08-28') RETURNING id`,
        )
        .get() as { id: number }
      const source = sqlite
        .query(
          `INSERT INTO skills (key, name, review_status, origin, created_at, updated_at)
           VALUES ('react-js', 'react.js', 'pending', 'manual', '2026-08-28', '2026-08-28') RETURNING id`,
        )
        .get() as { id: number }
      sqlite
        .query(
          `INSERT INTO skill_aliases (skill_id, alias, normalized_alias, origin, created_at)
           VALUES (?, 'react', 'react', 'manual', '2026-08-28')`,
        )
        .run(target.id)
      sqlite
        .query(
          `INSERT INTO skill_aliases (skill_id, alias, normalized_alias, origin, created_at)
           VALUES (?, 'react.js', 'react.js', 'manual', '2026-08-28')`,
        )
        .run(source.id)

      mergeSkills(source.id, target.id, db)

      const report = syncCareerSkills(
        db,
        careerSkills([
          { id: 'react', label: 'React', category: 'frontend', aliases: ['react.js'] },
        ]),
        { apply: true },
      )

      expect(report.conflicted).toBe(0)
      const mergedRow = sqlite
        .query('SELECT review_status, career_skill_id FROM skills WHERE id = ?')
        .get(source.id) as { review_status: string; career_skill_id: string | null }
      expect(mergedRow.review_status).toBe('merged')
      expect(mergedRow.career_skill_id).toBeNull()

      const targetRow = sqlite
        .query('SELECT career_skill_id, review_status FROM skills WHERE id = ?')
        .get(target.id) as { career_skill_id: string | null; review_status: string }
      expect(targetRow.career_skill_id).toBe('react')
      expect(targetRow.review_status).toBe('approved')
    } finally {
      sqlite.close()
    }
  })
})
