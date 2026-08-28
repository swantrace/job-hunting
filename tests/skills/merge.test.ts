import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from '../../src/db/schema'
import {
  addSkillAlias,
  approveSkill,
  MergeConflictError,
  mergeSkills,
  previewMerge,
  recategorizeSkill,
  rejectSkill,
  renameSkill,
} from '../../src/db/skill-service'
import { migratedDatabase, seedApplication } from '../support/sqlite'

function database() {
  const sqlite = migratedDatabase()
  return { sqlite, db: drizzle({ client: sqlite, schema }) }
}

function seedSkill(sqlite: ReturnType<typeof database>['sqlite'], key: string, name: string) {
  return sqlite
    .query(
      `INSERT INTO skills (key, name, category, review_status, origin, created_at, updated_at)
       VALUES (?, ?, NULL, 'pending', 'manual', '2026-08-28', '2026-08-28') RETURNING id`,
    )
    .get(key, name) as { id: number }
}

function relate(
  sqlite: ReturnType<typeof database>['sqlite'],
  applicationId: number,
  skillId: number,
  options: { decision?: string; reason?: string | null; rawLabel?: string } = {},
) {
  sqlite
    .query(
      `INSERT INTO job_applications_to_skills (
        job_application_id, skill_id, raw_label, importance, analysis_result,
        user_decision, decision_reason, created_at, updated_at
      ) VALUES (?, ?, ?, 'required', 'not-in-career-data', ?, ?, '2026-08-28', '2026-08-28')`,
    )
    .run(
      applicationId,
      skillId,
      options.rawLabel ?? null,
      options.decision ?? 'pending',
      options.reason ?? null,
    )
}

describe('transactional skill review and merge services', () => {
  test('moves aliases and application history without losing relations', () => {
    const { sqlite, db } = database()
    try {
      const source = seedSkill(sqlite, 'nodejs', 'Node.js')
      const target = seedSkill(sqlite, 'node-js', 'Node JS')
      addSkillAlias(source.id, 'node.js', 'manual', db)
      const { applicationId } = seedApplication(sqlite)
      relate(sqlite, applicationId, source.id)

      mergeSkills(source.id, target.id, db)

      const merged = sqlite
        .query('SELECT review_status, merged_into_skill_id FROM skills WHERE id = ?')
        .get(source.id) as { review_status: string; merged_into_skill_id: number }
      expect(merged.review_status).toBe('merged')
      expect(merged.merged_into_skill_id).toBe(target.id)

      const alias = sqlite
        .query('SELECT skill_id FROM skill_aliases WHERE normalized_alias = ?')
        .get('node.js') as { skill_id: number }
      expect(alias.skill_id).toBe(target.id)

      const relation = sqlite
        .query('SELECT skill_id FROM job_applications_to_skills WHERE job_application_id = ?')
        .get(applicationId) as { skill_id: number }
      expect(relation.skill_id).toBe(target.id)
    } finally {
      sqlite.close()
    }
  })

  test('deduplicates collisions while preserving raw labels and source excerpts', () => {
    const { sqlite, db } = database()
    try {
      const source = seedSkill(sqlite, 'react', 'React')
      const target = seedSkill(sqlite, 'reactjs', 'React.js')
      const { applicationId } = seedApplication(sqlite)
      relate(sqlite, applicationId, source.id, { rawLabel: 'React (raw)' })
      relate(sqlite, applicationId, target.id, { rawLabel: 'React.js (raw)' })

      mergeSkills(source.id, target.id, db)

      const relations = sqlite
        .query(
          'SELECT skill_id, raw_label FROM job_applications_to_skills WHERE job_application_id = ?',
        )
        .all(applicationId) as Array<{ skill_id: number; raw_label: string | null }>
      expect(relations).toHaveLength(1)
      expect(relations[0].skill_id).toBe(target.id)
      expect(relations[0].raw_label).toBe('React.js (raw)')
    } finally {
      sqlite.close()
    }
  })

  test('blocks and reports conflicting decisions without merging', () => {
    const { sqlite, db } = database()
    try {
      const source = seedSkill(sqlite, 'kafka', 'Kafka')
      const target = seedSkill(sqlite, 'apache-kafka', 'Apache Kafka')
      const { applicationId } = seedApplication(sqlite)
      relate(sqlite, applicationId, source.id, { decision: 'skip', reason: 'Not relevant' })
      relate(sqlite, applicationId, target.id, {
        decision: 'include',
        reason: 'Used in a personal prototype',
      })

      expect(previewMerge(source.id, target.id, db).conflicts).toEqual([
        {
          applicationId,
          sourceDecision: 'skip',
          targetDecision: 'include',
        },
      ])
      expect(() => mergeSkills(source.id, target.id, db)).toThrow(MergeConflictError)

      const sourceRow = sqlite
        .query('SELECT review_status, merged_into_skill_id FROM skills WHERE id = ?')
        .get(source.id) as { review_status: string; merged_into_skill_id: number | null }
      expect(sourceRow.review_status).toBe('pending')
      expect(sourceRow.merged_into_skill_id).toBeNull()
    } finally {
      sqlite.close()
    }
  })

  test('supports approve, reject, recategorize, and rename operations', () => {
    const { sqlite, db } = database()
    try {
      const skill = seedSkill(sqlite, 'vue', 'Vue')
      approveSkill(skill.id, db)
      expect(sqlite.query('SELECT review_status FROM skills WHERE id = ?').get(skill.id)).toEqual({
        review_status: 'approved',
      })

      rejectSkill(skill.id, db)
      expect(sqlite.query('SELECT review_status FROM skills WHERE id = ?').get(skill.id)).toEqual({
        review_status: 'rejected',
      })

      recategorizeSkill(skill.id, 'frontend', db)
      expect(sqlite.query('SELECT category FROM skills WHERE id = ?').get(skill.id)).toEqual({
        category: 'frontend',
      })

      renameSkill(skill.id, 'Vue.js', db)
      const renamed = sqlite.query('SELECT name, key FROM skills WHERE id = ?').get(skill.id) as {
        name: string
        key: string
      }
      expect(renamed.name).toBe('Vue.js')
      expect(renamed.key).toBe('vue.js')
    } finally {
      sqlite.close()
    }
  })
})
