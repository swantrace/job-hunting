import { describe, expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from '../../src/db/schema'
import {
  addSkillAlias,
  approveSkill,
  mergeSkills,
  previewMerge,
  recategorizeSkill,
  rejectSkill,
  renameSkill,
} from '../../src/db/skill-service'
import { migratedDatabase } from '../support/sqlite'

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

function seedRequirementLink(
  sqlite: ReturnType<typeof database>['sqlite'],
  skillId: number,
): number {
  const company = sqlite
    .query('INSERT INTO companies (name, created_at, updated_at) VALUES (?, ?, ?) RETURNING id')
    .get('Example Company', '2026-08-28', '2026-08-28') as { id: number }
  const application = sqlite
    .query(
      `INSERT INTO job_applications (
        company_id, job_title, direction, posted_date, priority, status, created_at, updated_at
      ) VALUES (?, ?, 'fullstack', '2026-08-28', 'B', 'Saved', '2026-08-28', '2026-08-28') RETURNING id`,
    )
    .get(company.id, 'Engineer') as { id: number }
  const posting = sqlite
    .query(
      `INSERT INTO job_postings (job_application_id, raw_text, captured_at, content_hash)
       VALUES (?, ?, '2026-08-28', ?) RETURNING id`,
    )
    .get(application.id, 'Role.', 'hash') as { id: number }
  const analysis = sqlite
    .query(
      'INSERT INTO job_posting_analyses (job_posting_id, created_at, updated_at) VALUES (?, ?, ?) RETURNING id',
    )
    .get(posting.id, '2026-08-28', '2026-08-28') as { id: number }
  const requirement = sqlite
    .query(
      `INSERT INTO job_requirements (
        job_posting_analysis_id, sequence, requirement_type, importance, basis, statement,
        source_text, created_at, updated_at
      ) VALUES (?, 1, 'skill', 'required', 'explicit', 'Skill requirement.', 'Skill requirement.', '2026-08-28', '2026-08-28') RETURNING id`,
    )
    .get(analysis.id) as { id: number }
  sqlite
    .query(
      `INSERT INTO job_requirement_skill_mentions (
        job_requirement_id, raw_term, normalized_term, mapping_state, resolved_skill_id,
        occurrences_json, created_at, updated_at
      ) VALUES (?, 'Skill requirement.', ?, 'mapped', ?, '[]', '2026-08-28', '2026-08-28')`,
    )
    .run(requirement.id, `term-${skillId}`, skillId)
  return requirement.id
}

function seedDecision(
  sqlite: ReturnType<typeof database>['sqlite'],
  skillId: number,
  decision: string,
): number {
  const company = sqlite
    .query('INSERT INTO companies (name, created_at, updated_at) VALUES (?, ?, ?) RETURNING id')
    .get('Decision Company', '2026-08-28', '2026-08-28') as { id: number }
  const application = sqlite
    .query(
      `INSERT INTO job_applications (
        company_id, job_title, direction, posted_date, priority, status, created_at, updated_at
      ) VALUES (?, ?, 'fullstack', '2026-08-28', 'B', 'Saved', '2026-08-28', '2026-08-28') RETURNING id`,
    )
    .get(company.id, 'Engineer') as { id: number }
  const posting = sqlite
    .query(
      `INSERT INTO job_postings (job_application_id, raw_text, captured_at, content_hash)
       VALUES (?, ?, '2026-08-28', ?) RETURNING id`,
    )
    .get(application.id, 'Role.', 'hash') as { id: number }
  const analysis = sqlite
    .query(
      'INSERT INTO job_posting_analyses (job_posting_id, created_at, updated_at) VALUES (?, ?, ?) RETURNING id',
    )
    .get(posting.id, '2026-08-28', '2026-08-28') as { id: number }
  const run = sqlite
    .query(
      `INSERT INTO application_analysis_runs (
        job_posting_analysis_id, status, queue_job_id, created_at, updated_at
      ) VALUES (?, 'Completed', ?, '2026-08-28', '2026-08-28') RETURNING id`,
    )
    .get(analysis.id, `run-${skillId}-${decision}`) as { id: number }
  sqlite
    .query(
      `INSERT INTO analysis_run_decisions (
        application_analysis_run_id, skill_id, decision, reason, created_at, updated_at
      ) VALUES (?, ?, ?, ?, '2026-08-28', '2026-08-28')`,
    )
    .run(run.id, skillId, decision, decision === 'include' ? 'Synthetic supporting evidence' : null)
  return run.id
}

describe('transactional skill review and merge services', () => {
  test('a Pending target inherits the source choice and reason, without rewriting snapshots', () => {
    const { sqlite, db } = database()
    try {
      const source = seedSkill(sqlite, 'pending-source', 'Pending Source')
      const target = seedSkill(sqlite, 'pending-target', 'Pending Target')
      const run = seedDecision(sqlite, source.id, 'include')
      const snapshot = JSON.stringify({ skillId: source.id, skillName: 'Pending Source' })
      sqlite
        .query('UPDATE application_analysis_runs SET input_snapshot_json=? WHERE id=?')
        .run(snapshot, run)
      sqlite
        .query(
          `INSERT INTO analysis_run_decisions(application_analysis_run_id,skill_id,decision,created_at,updated_at) VALUES(?,?,'pending','2026-10-16','2026-10-16')`,
        )
        .run(run, target.id)
      mergeSkills(source.id, target.id, db)
      expect(
        sqlite
          .query(
            'SELECT skill_id,decision,reason FROM analysis_run_decisions WHERE application_analysis_run_id=?',
          )
          .all(run),
      ).toEqual([
        { skill_id: target.id, decision: 'include', reason: 'Synthetic supporting evidence' },
      ])
      expect(
        sqlite
          .query('SELECT input_snapshot_json FROM application_analysis_runs WHERE id=?')
          .get(run),
      ).toEqual({ input_snapshot_json: snapshot })
      expect(sqlite.query('SELECT id FROM skills WHERE id=?').get(source.id)).toBeNull()
    } finally {
      sqlite.close()
    }
  })

  test('a failure at source deletion rolls back aliases, mappings and decisions', () => {
    const { sqlite, db } = database()
    try {
      const source = seedSkill(sqlite, 'rollback-source', 'Rollback Source')
      const target = seedSkill(sqlite, 'rollback-target', 'Rollback Target')
      addSkillAlias(source.id, 'Rollback alias', 'manual', db)
      seedRequirementLink(sqlite, source.id)
      seedDecision(sqlite, source.id, 'include')
      sqlite.exec(
        `CREATE TRIGGER prevent_skill_delete BEFORE DELETE ON skills BEGIN SELECT RAISE(ABORT, 'Synthetic deletion failure'); END`,
      )
      expect(() => mergeSkills(source.id, target.id, db)).toThrow('Synthetic deletion failure')
      expect(sqlite.query('SELECT skill_id FROM skill_aliases').all()).toEqual([
        { skill_id: source.id },
      ])
      expect(sqlite.query('SELECT skill_id FROM job_requirements_to_skills').all()).toEqual([
        { skill_id: source.id },
      ])
      expect(sqlite.query('SELECT skill_id FROM analysis_run_decisions').all()).toEqual([
        { skill_id: source.id },
      ])
      expect(sqlite.query('SELECT id FROM skills').all()).toHaveLength(2)
    } finally {
      sqlite.close()
    }
  })

  test('requires an explicit personal-level choice and preserves both evidence sets', () => {
    const { sqlite, db } = database()
    try {
      const source = seedSkill(sqlite, 'source-personal', 'Source Personal')
      const target = seedSkill(sqlite, 'target-personal', 'Target Personal')
      const insert = sqlite.query(
        `INSERT INTO career_skills(skill_id,level,resume_eligible,evidence_json,created_at,updated_at) VALUES(?,?,?,?,?,?)`,
      )
      insert.run(source.id, 'advanced', 1, '["source evidence"]', '2026-10-01', '2026-10-01')
      insert.run(target.id, 'learning', 0, '["target evidence"]', '2026-10-01', '2026-10-01')
      expect(() => mergeSkills(source.id, target.id, db)).toThrow(
        'Choose which personal skill settings',
      )
      expect(sqlite.query('SELECT review_status FROM skills WHERE id=?').get(source.id)).toEqual({
        review_status: 'pending',
      })
      mergeSkills(source.id, target.id, db, 'target')
      const personal = sqlite
        .query(
          'SELECT level,resume_eligible,evidence_json,extension_json FROM career_skills WHERE skill_id=?',
        )
        .get(target.id) as {
        level: string
        resume_eligible: number
        evidence_json: string
        extension_json: string
      }
      expect(personal.level).toBe('learning')
      expect(personal.resume_eligible).toBe(0)
      expect(JSON.parse(personal.evidence_json)).toEqual(['target evidence', 'source evidence'])
      expect(JSON.parse(personal.extension_json).mergedSources[0].sourceSkillKey).toBe(
        'source-personal',
      )
      expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
    } finally {
      sqlite.close()
    }
  })

  test('keeps the target Include decision and its exact reason', () => {
    const { sqlite, db } = database()
    try {
      const source = seedSkill(sqlite, 'include-source', 'Include Source')
      const target = seedSkill(sqlite, 'include-target', 'Include Target')
      const run = seedDecision(sqlite, source.id, 'include')
      sqlite
        .query('UPDATE analysis_run_decisions SET reason=? WHERE application_analysis_run_id=?')
        .run('Source experience', run)
      sqlite
        .query(
          `INSERT INTO analysis_run_decisions(application_analysis_run_id,skill_id,decision,reason,created_at,updated_at) VALUES(?,?,'include',?,'2026-10-01','2026-10-01')`,
        )
        .run(run, target.id, 'Target experience')
      mergeSkills(source.id, target.id, db)
      const decisions = sqlite
        .query(
          'SELECT skill_id,decision,reason FROM analysis_run_decisions WHERE application_analysis_run_id=?',
        )
        .all(run) as { skill_id: number; decision: string; reason: string }[]
      expect(decisions).toHaveLength(1)
      expect(decisions[0].skill_id).toBe(target.id)
      expect(decisions[0].decision).toBe('include')
      expect(decisions[0].reason).toBe('Target experience')
      expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
    } finally {
      sqlite.close()
    }
  })

  test('moves aliases and requirement links without losing relations', () => {
    const { sqlite, db } = database()
    try {
      const source = seedSkill(sqlite, 'nodejs', 'Node.js')
      const target = seedSkill(sqlite, 'node-js', 'Node JS')
      addSkillAlias(source.id, 'node.js', 'manual', db)
      seedRequirementLink(sqlite, source.id)

      mergeSkills(source.id, target.id, db)

      expect(sqlite.query('SELECT id FROM skills WHERE id = ?').get(source.id)).toBeNull()

      const alias = sqlite
        .query('SELECT skill_id FROM skill_aliases WHERE normalized_alias = ?')
        .get('node.js') as { skill_id: number }
      expect(alias.skill_id).toBe(target.id)

      const relation = sqlite
        .query('SELECT skill_id FROM job_requirements_to_skills LIMIT 1')
        .get() as { skill_id: number }
      expect(relation.skill_id).toBe(target.id)
    } finally {
      sqlite.close()
    }
  })

  test('moves a colliding mapping onto the target without a unique-index error', () => {
    const { sqlite, db } = database()
    try {
      const source = seedSkill(sqlite, 'react', 'React')
      const target = seedSkill(sqlite, 'reactjs', 'React.js')
      const requirementId = seedRequirementLink(sqlite, source.id)
      sqlite
        .query(
          `INSERT INTO job_requirement_skill_mentions (
            job_requirement_id, raw_term, normalized_term, mapping_state, resolved_skill_id,
            occurrences_json, created_at, updated_at
          ) VALUES (?, 'React.js', ?, 'mapped', ?, '[]', '2026-08-28', '2026-08-28')`,
        )
        .run(requirementId, `term-${target.id}`, target.id)

      mergeSkills(source.id, target.id, db)

      const links = sqlite
        .query('SELECT skill_id FROM job_requirements_to_skills WHERE job_requirement_id = ?')
        .all(requirementId) as Array<{ skill_id: number }>
      // Every mention that pointed at the source now points at the target; the
      // update never rewrites `normalized_term`, so no unique index collides.
      expect(links).toHaveLength(2)
      expect(links.every((link) => link.skill_id === target.id)).toBe(true)
    } finally {
      sqlite.close()
    }
  })

  test('resolves conflicting decisions using the target without AI analysis', () => {
    const { sqlite, db } = database()
    try {
      const source = seedSkill(sqlite, 'kafka', 'Kafka')
      const target = seedSkill(sqlite, 'apache-kafka', 'Apache Kafka')
      const runId = seedDecision(sqlite, source.id, 'skip')
      sqlite
        .query(
          `INSERT INTO analysis_run_decisions (
            application_analysis_run_id, skill_id, decision, reason, created_at, updated_at
          ) VALUES (?, ?, 'include', 'Used in a prototype', '2026-08-28', '2026-08-28')`,
        )
        .run(runId, target.id)

      expect(previewMerge(source.id, target.id, db).conflicts).toEqual([
        { runId, sourceDecision: 'skip', targetDecision: 'include' },
      ])
      mergeSkills(source.id, target.id, db)
      const decisions = sqlite
        .query(
          'SELECT decision, reason FROM analysis_run_decisions WHERE application_analysis_run_id = ?',
        )
        .all(runId) as { decision: string; reason: string | null }[]
      expect(decisions).toHaveLength(1)
      expect(decisions[0].decision).toBe('include')
      expect(decisions[0].reason).toBe('Used in a prototype')

      expect(sqlite.query('SELECT id FROM skills WHERE id = ?').get(source.id)).toBeNull()
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
      expect(renamed.key).toBe('vue')
    } finally {
      sqlite.close()
    }
  })
})
