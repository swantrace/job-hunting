import { describe, expect, test } from 'bun:test'
import { migratedDatabase } from '../support/sqlite'
import { seedPopulatedLegacyCatalog } from './fixtures'

/**
 * catalog and mapping contracts. They freeze the rules that already hold
 * in the current schema and that the database-owned catalog must keep:
 *
 * - a requirement/skill mapping is a statement about the job post, never a claim
 *  that the candidate possesses the skill;
 * - an Include evidence decision requires an explicit reason, while Skip does not;
 * - existing catalog provenance (approved, pending, merged, aliases) and the
 *  requirement mappings that reference it survive every migration.
 */

function columnNames(sqlite: ReturnType<typeof migratedDatabase>, table: string) {
  return (
    sqlite.query(`SELECT name FROM pragma_table_info('${table}')`).all() as Array<{ name: string }>
  ).map((column) => column.name)
}

describe('requirement to catalog mapping', () => {
  test('cannot express personal skill possession', () => {
    const sqlite = migratedDatabase()
    try {
      expect(columnNames(sqlite, 'job_requirements_to_skills').sort()).toEqual([
        'confidence',
        'job_requirement_id',
        'raw_label',
        'skill_id',
      ])
    } finally {
      sqlite.close()
    }
  })

  test('maps one requirement to a catalog entry while the candidate personal skills stay separate', () => {
    const sqlite = migratedDatabase()
    try {
      const seeded = seedPopulatedLegacyCatalog(sqlite)
      const mapping = sqlite
        .query(
          `SELECT skill_id, raw_label, confidence FROM job_requirements_to_skills
      WHERE job_requirement_id = ?`,
        )
        .all(seeded.requirementId) as Array<{
        skill_id: number
        raw_label: string
        confidence: number
      }>
      expect(mapping).toEqual([
        { skill_id: seeded.typescriptSkillId, raw_label: 'TypeScript', confidence: 1 },
      ])

      const decisionCount = sqlite
        .query('SELECT count(*) AS count FROM analysis_run_decisions')
        .get() as { count: number }
      expect(decisionCount.count).toBe(0)
    } finally {
      sqlite.close()
    }
  })
})

describe('catalog provenance', () => {
  test('preserves approved, pending and merged entries with their aliases and mappings', () => {
    const sqlite = migratedDatabase()
    try {
      const seeded = seedPopulatedLegacyCatalog(sqlite)

      const rows = sqlite
        .query(
          `SELECT key, name, review_status, origin, merged_into_skill_id
      FROM skills ORDER BY id`,
        )
        .all() as Array<{
        key: string
        name: string
        review_status: string
        origin: string
        merged_into_skill_id: number | null
      }>

      expect(rows[0]).toMatchObject({
        key: 'typescript',
        review_status: 'approved',
        origin: 'career-data',
        merged_into_skill_id: null,
      })
      // Legacy parser output stays pending until a user promotes it explicitly.
      expect(rows[1]).toMatchObject({ review_status: 'pending', origin: 'job-parser' })
      expect(rows[2]).toMatchObject({
        review_status: 'merged',
        merged_into_skill_id: seeded.typescriptSkillId,
      })

      const alias = sqlite
        .query('SELECT skill_id, normalized_alias FROM skill_aliases')
        .all() as Array<{ skill_id: number; normalized_alias: string }>
      expect(alias).toEqual([{ skill_id: seeded.typescriptSkillId, normalized_alias: 'ts' }])

      const unapprovedMappings = sqlite
        .query(
          `SELECT count(*) AS count FROM job_requirements_to_skills
      WHERE skill_id IN (SELECT id FROM skills WHERE review_status != 'approved')`,
        )
        .get() as { count: number }
      expect(unapprovedMappings.count).toBe(0)
    } finally {
      sqlite.close()
    }
  })

  test('reports clean foreign key and integrity checks', () => {
    const sqlite = migratedDatabase()
    try {
      seedPopulatedLegacyCatalog(sqlite)
      expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
      expect(sqlite.query('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' })
    } finally {
      sqlite.close()
    }
  })
})

describe('evidence decisions', () => {
  test('require a reason for Include and accept Skip without one', () => {
    const sqlite = migratedDatabase()
    try {
      const seeded = seedPopulatedLegacyCatalog(sqlite)
      const insert = sqlite.query(
        `INSERT INTO analysis_run_decisions (
     application_analysis_run_id, skill_id, decision, reason, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      const timestamp = '2026-10-14T00:00:00.000Z'

      expect(() =>
        insert.run(
          seeded.applicationAnalysisRunId,
          seeded.pendingSkillId,
          'include',
          '  ',
          timestamp,
          timestamp,
        ),
      ).toThrow()

      insert.run(
        seeded.applicationAnalysisRunId,
        seeded.pendingSkillId,
        'include',
        'Synthetic attested reason.',
        timestamp,
        timestamp,
      )
      insert.run(
        seeded.applicationAnalysisRunId,
        seeded.mergedSkillId,
        'skip',
        null,
        timestamp,
        timestamp,
      )

      const decisions = sqlite
        .query(
          `SELECT skill_id, decision, reason FROM analysis_run_decisions
      ORDER BY skill_id`,
        )
        .all() as Array<{ skill_id: number; decision: string; reason: string | null }>
      expect(decisions).toEqual([
        {
          skill_id: seeded.pendingSkillId,
          decision: 'include',
          reason: 'Synthetic attested reason.',
        },
        { skill_id: seeded.mergedSkillId, decision: 'skip', reason: null },
      ])
    } finally {
      sqlite.close()
    }
  })

  test('keeps one evidence decision per skill per candidate run', () => {
    const sqlite = migratedDatabase()
    try {
      const seeded = seedPopulatedLegacyCatalog(sqlite)
      const insert = sqlite.query(
        `INSERT INTO analysis_run_decisions (
     application_analysis_run_id, skill_id, decision, reason, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      const timestamp = '2026-10-14T00:00:00.000Z'
      insert.run(
        seeded.applicationAnalysisRunId,
        seeded.pendingSkillId,
        'skip',
        null,
        timestamp,
        timestamp,
      )
      expect(() =>
        insert.run(
          seeded.applicationAnalysisRunId,
          seeded.pendingSkillId,
          'skip',
          null,
          timestamp,
          timestamp,
        ),
      ).toThrow()
    } finally {
      sqlite.close()
    }
  })
})
