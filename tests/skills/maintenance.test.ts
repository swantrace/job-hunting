import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { careerContentProbe } from '../../src/db/career-shared'
import * as schema from '../../src/db/schema'
import { applySkillImport, exportSkillCatalog, skillImportState } from '../../src/db/skill-import'
import { insertSkill, resolveSkill } from '../../src/db/skill-queries'
import {
  consolidateLegacyMergedSkills,
  listSkillAliases,
  renameSkill,
  replaceSkillAliases,
} from '../../src/db/skill-service'
import { importPayloadSchema } from '../../src/lib/job-intake/import'
import { migratedDatabase } from '../support/sqlite'

function database() {
  const sqlite = migratedDatabase()
  const db = drizzle({ client: sqlite, schema })
  return { sqlite, db }
}

describe('skill catalog maintenance', () => {
  test('imports legacy soft-merged rows as target aliases, not new redirect records', () => {
    const { sqlite, db } = database()
    try {
      const payload = importPayloadSchema.parse({
        schemaVersion: 5,
        skills: [
          {
            id: 10,
            key: 'react-js',
            name: 'ReactJS',
            reviewStatus: 'merged',
            mergedIntoSkillId: 20,
          },
          { id: 20, key: 'react', name: 'React', reviewStatus: 'approved' },
        ],
        skillAliases: [{ skillId: 10, alias: 'React library' }],
      })
      db.transaction((tx) => applySkillImport(payload, tx))
      const rows = skillImportState(db)
      expect(rows).toHaveLength(1)
      expect(rows[0].key).toBe('react')
      expect(rows[0].aliases).toContain('React library')
      expect(resolveSkill(db, 'react-js')?.id).toBe(rows[0].id)
      expect(resolveSkill(db, 'ReactJS')?.id).toBe(rows[0].id)
    } finally {
      sqlite.close()
    }
  })

  test('stable rename and editable aliases share one namespace, without claiming personal skills', () => {
    const { sqlite, db } = database()
    try {
      const react = insertSkill(db, { name: 'React', key: 'react' })
      const vue = insertSkill(db, { name: 'Vue', key: 'vue' })
      renameSkill(react.id, 'React framework', db)
      expect(db.select().from(schema.skills).where(eq(schema.skills.id, react.id)).get()?.key).toBe(
        'react',
      )
      replaceSkillAliases(react.id, ['React.js', ' react.js ', 'ReactJS'], db)
      expect(listSkillAliases(react.id, db)).toEqual(['React.js', 'ReactJS'])
      expect(() => renameSkill(react.id, 'Vue', db)).toThrow('another skill')
      expect(() => replaceSkillAliases(react.id, ['Vue'], db)).toThrow('another skill')
      expect(() => replaceSkillAliases(vue.id, ['ReactJS'], db)).toThrow('another skill')
      for (const bad of ['', '  ', ')'])
        expect(() => replaceSkillAliases(react.id, [bad], db)).toThrow()
      expect(listSkillAliases(react.id, db)).toEqual(['React.js', 'ReactJS'])
      replaceSkillAliases(react.id, [], db)
      expect(listSkillAliases(react.id, db)).toEqual([])
      expect(resolveSkill(db, 'React framework')?.id).toBe(react.id)
      expect(db.select().from(schema.careerSkills).all()).toEqual([])
    } finally {
      sqlite.close()
    }
  })

  test('imports partial aliases, replacements, empty sets and legacy arrays', () => {
    const { sqlite, db } = database()
    try {
      const react = insertSkill(db, { name: 'React', key: 'react' })
      const apply = (value: object) =>
        db.transaction((tx) =>
          applySkillImport(importPayloadSchema.parse({ schemaVersion: 6, ...value }), tx),
        )
      apply({ skills: [{ key: 'react', name: 'React framework' }] })
      expect(listSkillAliases(react.id, db)).toEqual(['React'])
      apply({
        skills: [{ key: 'react', name: 'React framework', aliases: ['ReactJS', 'reactjs'] }],
      })
      expect(listSkillAliases(react.id, db)).toEqual(['ReactJS'])
      apply({
        skills: [{ id: 999, key: 'react', name: 'React framework' }],
        skillAliases: [{ skillId: 999, alias: 'React.js' }],
      })
      expect(listSkillAliases(react.id, db)).toEqual(['ReactJS', 'React.js'])
      apply({ skills: [{ key: 'react', name: 'React framework', aliases: [] }] })
      expect(listSkillAliases(react.id, db)).toEqual([])
      expect(db.select().from(schema.skills).all()).toHaveLength(1)
    } finally {
      sqlite.close()
    }
  })

  test('explicit merge and delete are atomic, missing skills are not deleted', () => {
    const { sqlite, db } = database()
    try {
      const source = insertSkill(db, { name: 'ReactJS', key: 'react-js' })
      const target = insertSkill(db, { name: 'React', key: 'react' })
      insertSkill(db, { name: 'Obsolete', key: 'obsolete' })
      const keep = insertSkill(db, { name: 'Keep', key: 'keep' })
      const apply = (value: object) =>
        db.transaction((tx) =>
          applySkillImport(importPayloadSchema.parse({ schemaVersion: 6, ...value }), tx),
        )
      const before = skillImportState(db)
      expect(() =>
        apply({
          mergeSkills: [{ sourceKey: source.key, targetKey: target.key }],
          deleteSkills: ['missing'],
        }),
      ).toThrow()
      expect(skillImportState(db)).toEqual(before)
      apply({
        mergeSkills: [{ sourceKey: source.key, targetKey: target.key }],
        deleteSkills: ['obsolete'],
      })
      expect(
        db.select().from(schema.skills).where(eq(schema.skills.id, source.id)).get(),
      ).toBeUndefined()
      expect(listSkillAliases(target.id, db)).toContain('react-js')
      expect(resolveSkill(db, source.key)?.id).toBe(target.id)
      expect(
        db.select().from(schema.skills).where(eq(schema.skills.id, keep.id)).get(),
      ).toBeDefined()
      expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
    } finally {
      sqlite.close()
    }
  })

  test('cleans legacy redirect chains atomically and is idempotent', () => {
    const { sqlite, db } = database()
    try {
      const target = insertSkill(db, { name: 'React', key: 'react' })
      const middle = insertSkill(db, { name: 'ReactJS', key: 'react-js' })
      const oldest = insertSkill(db, { name: 'React Framework', key: 'react-framework' })
      db.update(schema.skills)
        .set({ reviewStatus: 'merged', mergedIntoSkillId: target.id })
        .where(eq(schema.skills.id, middle.id))
        .run()
      db.update(schema.skills)
        .set({ reviewStatus: 'merged', mergedIntoSkillId: middle.id })
        .where(eq(schema.skills.id, oldest.id))
        .run()
      const beforeExport = skillImportState(db)
      const exported = exportSkillCatalog(db)
      expect(exported).toHaveLength(1)
      expect(exported[0].aliases).toContain('react-framework')
      expect(skillImportState(db)).toEqual(beforeExport)
      expect(consolidateLegacyMergedSkills(db)).toBe(2)
      expect(db.select().from(schema.skills).all()).toHaveLength(1)
      expect(resolveSkill(db, 'React Framework')?.id).toBe(target.id)
      expect(consolidateLegacyMergedSkills(db)).toBe(0)
      expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
    } finally {
      sqlite.close()
    }
  })

  test('same-count alias edits invalidate the content probe without changing timestamps', () => {
    const { sqlite, db } = database()
    try {
      const skill = insertSkill(db, { name: 'React', key: 'react' })
      const before = careerContentProbe(db)
      db.update(schema.skillAliases)
        .set({ alias: 'ReactJS', normalizedAlias: 'reactjs' })
        .where(eq(schema.skillAliases.skillId, skill.id))
        .run()
      expect(careerContentProbe(db)).not.toBe(before)
      const after = careerContentProbe(db)
      db.update(schema.skills)
        .set({ name: 'React framework' })
        .where(eq(schema.skills.id, skill.id))
        .run()
      expect(careerContentProbe(db)).not.toBe(after)
    } finally {
      sqlite.close()
    }
  })
})
