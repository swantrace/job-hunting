import { describe, expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { resolveApprovedSkill, resolveSkill } from '../../src/db/skill-queries'
import { migratedDatabase } from '../support/sqlite'

describe('canonical skill resolution by key', () => {
  test('resolves a career-data skill from its display label without a label alias', () => {
    const sqlite = migratedDatabase()
    try {
      // Career-data sync stores the kebab-case id as `skills.key` and does not
      // create an alias row for the label itself.
      const skill = sqlite
        .query(
          `INSERT INTO skills (key, name, category, review_status, origin, created_at, updated_at)
           VALUES ('machine-learning', 'Machine Learning', NULL, 'approved', 'career-data', '2026-01-01', '2026-01-01') RETURNING id`,
        )
        .get() as { id: number }
      const db = drizzle({ client: sqlite })

      expect(resolveSkill(db, 'Machine Learning')?.id).toBe(skill.id)
      expect(resolveApprovedSkill(db, 'machine learning')?.id).toBe(skill.id)
    } finally {
      sqlite.close()
    }
  })

  test('resolves special-character keys by canonical key without duplicate inserts', () => {
    const sqlite = migratedDatabase()
    try {
      sqlite
        .query(
          `INSERT INTO skills (key, name, review_status, origin, created_at, updated_at)
           VALUES ('c-sharp', 'C#', 'approved', 'career-data', '2026-01-01', '2026-01-01')`,
        )
        .run()
      sqlite
        .query(
          `INSERT INTO skills (key, name, review_status, origin, created_at, updated_at)
           VALUES ('net', '.NET', 'approved', 'career-data', '2026-01-01', '2026-01-01')`,
        )
        .run()
      sqlite
        .query(
          `INSERT INTO skills (key, name, review_status, origin, created_at, updated_at)
           VALUES ('c-plus-plus', 'C++', 'approved', 'career-data', '2026-01-01', '2026-01-01')`,
        )
        .run()
      const db = drizzle({ client: sqlite })

      expect(resolveSkill(db, 'C#')?.key).toBe('c-sharp')
      expect(resolveSkill(db, '.NET')?.key).toBe('net')
      expect(resolveSkill(db, 'C++')?.key).toBe('c-plus-plus')
      expect(resolveApprovedSkill(db, 'c#')?.key).toBe('c-sharp')
    } finally {
      sqlite.close()
    }
  })

  test('still resolves by alias when the key does not match', () => {
    const sqlite = migratedDatabase()
    try {
      const skill = sqlite
        .query(
          `INSERT INTO skills (key, name, review_status, origin, created_at, updated_at)
           VALUES ('react', 'React', 'approved', 'career-data', '2026-01-01', '2026-01-01') RETURNING id`,
        )
        .get() as { id: number }
      sqlite
        .query(
          `INSERT INTO skill_aliases (skill_id, alias, normalized_alias, origin, created_at)
           VALUES (?, 'React.js', 'react.js', 'career-data', '2026-01-01')`,
        )
        .run(skill.id)
      const db = drizzle({ client: sqlite })

      expect(resolveSkill(db, 'React.js')?.id).toBe(skill.id)
    } finally {
      sqlite.close()
    }
  })
})
