import { describe, expect, test } from 'bun:test'
import { canonicalSkillKey, normalizeSkillAlias } from '../../src/lib/skills/normalize'
import {
  createBaselineMigrationFolder,
  migratedDatabase,
  removeTempDir,
  seedLegacySkill,
} from '../support/sqlite'

/**
 * Freezes the legacy storage-normalization contract before the canonical
 * taxonomy migration lands. The two-column `skills` table is unique only on
 * `lower(name)`, so case-only duplicates collide while punctuation-sensitive
 * names and semantic aliases remain distinguishable.
 */
describe('current skill storage normalization', () => {
  test('keeps punctuation-sensitive names distinguishable under lower(name)', () => {
    const folder = createBaselineMigrationFolder()
    const sqlite = migratedDatabase(folder)
    try {
      for (const name of ['.NET', 'C', 'C++', 'C#', 'Node.js']) {
        const skill = seedLegacySkill(sqlite, name)
        expect(skill.id).toBeGreaterThan(0)
      }
      const names = sqlite
        .query('SELECT name FROM skills ORDER BY id')
        .all()
        .map((row) => String((row as { name: string }).name))
      expect(names).toEqual(['.NET', 'C', 'C++', 'C#', 'Node.js'])
    } finally {
      sqlite.close()
      removeTempDir(folder)
    }
  })

  test('rejects case-only duplicates but not exact or alias duplicates', () => {
    const folder = createBaselineMigrationFolder()
    const sqlite = migratedDatabase(folder)
    try {
      seedLegacySkill(sqlite, 'React')
      expect(() => seedLegacySkill(sqlite, 'react')).toThrow()

      // Semantic aliases are not collapsed by the legacy schema: `Node.js`
      // and `nodejs` coexist even though they refer to the same technology.
      seedLegacySkill(sqlite, 'Node.js')
      seedLegacySkill(sqlite, 'nodejs')
      const count = sqlite.query('SELECT count(*) AS count FROM skills').get() as { count: number }
      expect(count.count).toBe(3)
    } finally {
      sqlite.close()
      removeTempDir(folder)
    }
  })

  test('stores non-skill working arrangements as ordinary rows in the legacy schema', () => {
    const folder = createBaselineMigrationFolder()
    const sqlite = migratedDatabase(folder)
    try {
      seedLegacySkill(sqlite, 'remote')
      seedLegacySkill(sqlite, 'hybrid')
      const count = sqlite.query('SELECT count(*) AS count FROM skills').get() as { count: number }
      expect(count.count).toBe(2)
    } finally {
      sqlite.close()
      removeTempDir(folder)
    }
  })
})

describe('shared skill alias normalization', () => {
  test('folds Unicode, trims, lowercases, and collapses whitespace', () => {
    expect(normalizeSkillAlias('  Node.JS  ')).toBe('node.js')
    expect(normalizeSkillAlias('Node   JS')).toBe('node js')
    expect(normalizeSkillAlias('ＴｙｐｅＳｃｒｉｐｔ')).toBe('typescript')
  })

  test('preserves punctuation that changes technical meaning', () => {
    const cFamily = ['C', 'C++', 'C#'].map(normalizeSkillAlias)
    expect(new Set(cFamily).size).toBe(3)
    expect(normalizeSkillAlias('.NET')).not.toBe(normalizeSkillAlias('net'))
  })
})

describe('canonical skill keys', () => {
  test('creates predictable lowercase machine IDs without ambiguous punctuation', () => {
    expect(canonicalSkillKey('Node.js')).toBe('nodejs')
    expect(canonicalSkillKey('REST API')).toBe('rest-api')
    expect(canonicalSkillKey('C++')).toBe('c-plus-plus')
    expect(canonicalSkillKey('C#')).toBe('c-sharp')
  })
})
