import { describe, expect, test } from 'bun:test'
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
    .query('INSERT INTO job_requirements_to_skills (job_requirement_id, skill_id) VALUES (?, ?)')
    .run(requirement.id, skillId)
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
      ) VALUES (?, ?, ?, NULL, '2026-08-28', '2026-08-28')`,
    )
    .run(run.id, skillId, decision)
  return run.id
}

describe('transactional skill review and merge services', () => {
  test('moves aliases and requirement links without losing relations', () => {
    const { sqlite, db } = database()
    try {
      const source = seedSkill(sqlite, 'nodejs', 'Node.js')
      const target = seedSkill(sqlite, 'node-js', 'Node JS')
      addSkillAlias(source.id, 'node.js', 'manual', db)
      seedRequirementLink(sqlite, source.id)

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
        .query('SELECT skill_id FROM job_requirements_to_skills LIMIT 1')
        .get() as { skill_id: number }
      expect(relation.skill_id).toBe(target.id)
    } finally {
      sqlite.close()
    }
  })

  test('deduplicates requirement-link collisions', () => {
    const { sqlite, db } = database()
    try {
      const source = seedSkill(sqlite, 'react', 'React')
      const target = seedSkill(sqlite, 'reactjs', 'React.js')
      const requirementId = seedRequirementLink(sqlite, source.id)
      sqlite
        .query(
          'INSERT INTO job_requirements_to_skills (job_requirement_id, skill_id) VALUES (?, ?)',
        )
        .run(requirementId, target.id)

      mergeSkills(source.id, target.id, db)

      const links = sqlite
        .query('SELECT skill_id FROM job_requirements_to_skills WHERE job_requirement_id = ?')
        .all(requirementId) as Array<{ skill_id: number }>
      expect(links).toHaveLength(1)
      expect(links[0].skill_id).toBe(target.id)
    } finally {
      sqlite.close()
    }
  })

  test('blocks and reports conflicting run-scoped decisions without merging', () => {
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
