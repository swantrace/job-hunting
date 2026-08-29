import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from '../../src/db/schema'
import { syncSkillTaxonomy } from '../../src/lib/skills/sync-taxonomy'
import { loadSkillTaxonomy } from '../../src/lib/skills/taxonomy'
import { migratedDatabase } from '../support/sqlite'

function database() {
  const sqlite = migratedDatabase()
  return { sqlite, db: drizzle({ client: sqlite, schema }) }
}

describe('skill taxonomy configuration synchronization', () => {
  test('loads one ordered, unique JSON category vocabulary', () => {
    const taxonomy = loadSkillTaxonomy()
    expect(taxonomy.categories.length).toBeGreaterThan(0)
    expect(new Set(taxonomy.categories.map((category) => category.key)).size).toBe(
      taxonomy.categories.length,
    )
    expect(new Set(taxonomy.categories.map((category) => category.sortOrder)).size).toBe(
      taxonomy.categories.length,
    )
  })

  test('upserts JSON-owned label and sort order without deleting orphaned rows', () => {
    const { sqlite, db } = database()
    try {
      const first = syncSkillTaxonomy(
        db,
        [
          { key: 'frontend', label: 'Frontend Engineering', sortOrder: 20 },
          { key: 'data', label: 'Data', sortOrder: 30 },
        ],
        { apply: true },
      )
      expect(first.inserted).toBe(1)
      expect(first.updated).toBe(1)

      const second = syncSkillTaxonomy(
        db,
        [{ key: 'frontend', label: 'Frontend', sortOrder: 10 }],
        { apply: true },
      )
      expect(second.updated).toBe(1)
      expect(second.orphaned).toContain('data')

      expect(
        sqlite
          .query('SELECT label, sort_order FROM skill_categories WHERE key = ?')
          .get('frontend'),
      ).toEqual({ label: 'Frontend', sort_order: 10 })
      expect(sqlite.query('SELECT key FROM skill_categories WHERE key = ?').get('data')).toEqual({
        key: 'data',
      })
    } finally {
      sqlite.close()
    }
  })

  test('enforces the category foreign key for operational skills', () => {
    const sqlite = migratedDatabase()
    try {
      expect(() =>
        sqlite
          .query(
            `INSERT INTO skills (key, name, category, review_status, origin, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            'unknown-skill',
            'Unknown Skill',
            'not-configured',
            'pending',
            'manual',
            '2026-08-28',
            '2026-08-28',
          ),
      ).toThrow()
    } finally {
      sqlite.close()
    }
  })
})
