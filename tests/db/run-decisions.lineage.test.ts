import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { findPriorDecision, upsertRunDecision } from '../../src/db/analysis-decisions'
import { migratedDatabase } from '../support/sqlite'

/**
 * Run-scoped decision lineage contract: prior suggestions are looked up only
 * within the same application lineage (Job Analysis -> Job Post -> application),
 * never across unrelated applications sharing a canonical skill.
 */

function seedLineage(sqlite: Database, companyName: string) {
  const company = sqlite
    .query('INSERT INTO companies (name, created_at, updated_at) VALUES (?, ?, ?) RETURNING id')
    .get(companyName, '2026-01-01', '2026-01-01') as { id: number }
  const application = sqlite
    .query(
      `INSERT INTO job_applications (
        company_id, job_title, direction, posted_date, priority, status, created_at, updated_at
      ) VALUES (?, 'Engineer', 'fullstack', '2026-01-01', 'B', 'Saved', '2026-01-01', '2026-01-01') RETURNING id`,
    )
    .get(company.id) as { id: number }
  const posting = sqlite
    .query(
      `INSERT INTO job_postings (job_application_id, raw_text, captured_at, content_hash)
       VALUES (?, 'Role.', '2026-01-01', ?) RETURNING id`,
    )
    .get(application.id, `hash-${companyName}`) as { id: number }
  const analysis = sqlite
    .query(
      `INSERT INTO job_posting_analyses (job_posting_id, created_at, updated_at) VALUES (?, '2026-01-01', '2026-01-01') RETURNING id`,
    )
    .get(posting.id) as { id: number }
  const run = sqlite
    .query(
      `INSERT INTO application_analysis_runs (
        job_posting_analysis_id, status, queue_job_id, created_at, updated_at
      ) VALUES (?, 'Completed', ?, '2026-01-01', '2026-01-01') RETURNING id`,
    )
    .get(analysis.id, `run-${companyName}`) as { id: number }
  return { applicationId: application.id, analysisId: analysis.id, runId: run.id }
}

function seedRun(sqlite: Database, applicationId: number, analysisId: number, name: string) {
  return sqlite
    .query(
      `INSERT INTO application_analysis_runs (
        job_posting_analysis_id, status, queue_job_id, created_at, updated_at
      ) VALUES (?, 'Completed', ?, '2026-01-01', '2026-01-01') RETURNING id`,
    )
    .get(analysisId, name) as { id: number }
}

describe('run-scoped decision lineage', () => {
  test('scopes prior suggestions to the same application lineage', () => {
    const sqlite = migratedDatabase()
    try {
      const db = drizzle({ client: sqlite })
      const skill = sqlite
        .query(
          `INSERT INTO skills (key, name, review_status, origin, created_at, updated_at)
           VALUES ('kafka', 'Kafka', 'pending', 'job-parser', '2026-01-01', '2026-01-01') RETURNING id`,
        )
        .get() as { id: number }

      const appA = seedLineage(sqlite, 'Example A')
      const appB = seedLineage(sqlite, 'Example B')
      const appARerun = seedRun(sqlite, appA.applicationId, appA.analysisId, 'run-a-2')

      upsertRunDecision(db, {
        runId: appA.runId,
        skillId: skill.id,
        decision: 'include',
        reason: 'Used Kafka in a personal prototype.',
      })

      // Same canonical skill, but a different application lineage: no suggestion.
      expect(findPriorDecision(db, appB.runId, skill.id)).toBeNull()
      // Same application lineage: the prior include decision is suggested.
      expect(findPriorDecision(db, appARerun.id, skill.id)?.decision).toBe('include')
      expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
    } finally {
      sqlite.close()
    }
  })
})
