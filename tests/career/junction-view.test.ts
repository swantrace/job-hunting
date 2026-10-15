import { describe, expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from '../../src/db/schema'
import {
  mapMention,
  resetMention,
  skipMention,
  upsertPendingMention,
} from '../../src/db/skill-mentions'
import { migratedDatabase } from '../support/sqlite'

const T = '2026-10-14T00:00:00.000Z'

/**
 * `job_requirements_to_skills` is a read-only view over the mention rows
 * (migration 0027): mapping writes only the mention, and the view derives
 * `raw_label`/`confidence` from `raw_term`/`occurrences_json`.
 */
function database() {
  const sqlite = migratedDatabase()
  const db = drizzle({ client: sqlite, schema })
  const company = sqlite
    .query('INSERT INTO companies (name, created_at, updated_at) VALUES (?, ?, ?) RETURNING id')
    .get('Example Co', T, T) as { id: number }
  const application = sqlite
    .query(
      `INSERT INTO job_applications (company_id, job_title, posted_date, priority, status, created_at, updated_at)
       VALUES (?, 'Engineer', '2026-10-01', 'B', 'Saved', ?, ?) RETURNING id`,
    )
    .get(company.id, T, T) as { id: number }
  const posting = sqlite
    .query(
      `INSERT INTO job_postings (job_application_id, version, raw_text, captured_at, content_hash)
       VALUES (?, 1, 'We use TypeScript.', ?, 'hash') RETURNING id`,
    )
    .get(application.id, T) as { id: number }
  const analysis = sqlite
    .query(
      `INSERT INTO job_posting_analyses (job_posting_id, status, created_at, updated_at, completed_at)
       VALUES (?, 'Completed', ?, ?, ?) RETURNING id`,
    )
    .get(posting.id, T, T, T) as { id: number }
  const requirement = sqlite
    .query(
      `INSERT INTO job_requirements (
        job_posting_analysis_id, sequence, requirement_type, importance, basis, statement, source_text,
        created_at, updated_at
      ) VALUES (?, 1, 'skill', 'required', 'explicit', 'TypeScript required.', 'TypeScript', ?, ?) RETURNING id`,
    )
    .get(analysis.id, T, T) as { id: number }
  const skill = sqlite
    .query(
      `INSERT INTO skills (key, name, review_status, origin, created_at, updated_at)
       VALUES ('typescript', 'TypeScript', 'approved', 'career-data', ?, ?) RETURNING id`,
    )
    .get(T, T) as { id: number }
  return { sqlite, db, requirementId: requirement.id, skillId: skill.id }
}

function viewRows(sqlite: ReturnType<typeof database>['sqlite']) {
  return sqlite
    .query(
      'SELECT job_requirement_id, skill_id, raw_label, confidence FROM job_requirements_to_skills',
    )
    .all()
}

describe('job_requirements_to_skills view', () => {
  test('exposes a mapped mention with its raw label and confidence', () => {
    const { sqlite, db, requirementId, skillId } = database()
    try {
      const mention = upsertPendingMention(db, {
        jobRequirementId: requirementId,
        rawTerm: 'TypeScript',
        normalizedTerm: 'typescript',
        occurrences: [{ source: 'jd', provenance: 'jd-text', confidence: 0.75 }],
      })
      expect(viewRows(sqlite)).toEqual([])

      mapMention(db, mention.id, skillId)
      expect(viewRows(sqlite)).toEqual([
        {
          job_requirement_id: requirementId,
          skill_id: skillId,
          raw_label: 'TypeScript',
          confidence: 0.75,
        },
      ])

      // The single mapping store is the mention row.
      expect(
        sqlite
          .query(
            'SELECT mapping_state, resolved_skill_id FROM job_requirement_skill_mentions WHERE id = ?',
          )
          .get(mention.id),
      ).toEqual({ mapping_state: 'mapped', resolved_skill_id: skillId })

      // Skip and reset remove the derived row without a second storage write.
      skipMention(db, mention.id)
      expect(viewRows(sqlite)).toEqual([])
      mapMention(db, mention.id, skillId)
      resetMention(db, mention.id)
      expect(viewRows(sqlite)).toEqual([])
    } finally {
      sqlite.close()
    }
  })

  test('rejects a direct write because the junction is a view', () => {
    const { sqlite, requirementId, skillId } = database()
    try {
      expect(
        sqlite
          .query("SELECT type FROM sqlite_master WHERE name = 'job_requirements_to_skills'")
          .get(),
      ).toEqual({ type: 'view' })
      expect(() =>
        sqlite
          .query(
            'INSERT INTO job_requirements_to_skills (job_requirement_id, skill_id) VALUES (?, ?)',
          )
          .run(requirementId, skillId),
      ).toThrow(/view/)
      expect(() => sqlite.query('DELETE FROM job_requirements_to_skills').run()).toThrow(/view/)
    } finally {
      sqlite.close()
    }
  })
})
