import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { migratedDatabase } from '../support/sqlite'

/**
 * Run-scoped decision migration contract: the new table is created and only
 * unambiguous legacy decisions are backfilled to the latest completed run.
 */
function migrationFolderUpTo(lastIndex: number) {
  const root = mkdtempSync(resolve(tmpdir(), 'job-tracker-decisions-migrations-'))
  const metaDirectory = resolve(root, 'meta')
  mkdirSync(metaDirectory)
  for (let index = 0; index <= lastIndex; index += 1) {
    const prefix = `${String(index).padStart(4, '0')}_`
    const fileName = Array.from(new Bun.Glob(`${prefix}*.sql`).scanSync('drizzle'))[0]
    if (!fileName) throw new Error(`Missing migration with prefix ${prefix}.`)
    cpSync(resolve('drizzle', fileName), resolve(root, fileName))
  }
  const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')) as {
    entries: Array<{ idx: number }>
  }
  journal.entries = journal.entries.filter((entry) => entry.idx <= lastIndex)
  writeFileSync(resolve(metaDirectory, '_journal.json'), JSON.stringify(journal))
  return root
}

function migratedAt(folder: string) {
  const sqlite = new Database(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON;')
  migrate(drizzle({ client: sqlite }), { migrationsFolder: folder })
  return sqlite
}

function seedLegacyDecisions(sqlite: Database) {
  const company = sqlite
    .query('INSERT INTO companies (name, created_at) VALUES (?, ?) RETURNING id')
    .get('Example', '2026-01-01') as { id: number }
  const application = sqlite
    .query(
      `INSERT INTO job_applications (
        company_id, job_title, direction, posted_date, priority, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .get(
      company.id,
      'Engineer',
      'fullstack',
      '2026-01-01',
      'B',
      'Saved',
      '2026-01-01',
      '2026-01-01',
    ) as { id: number }
  const run = sqlite
    .query(
      `INSERT INTO application_analysis_runs (
        job_application_id, status, queue_job_id, created_at, updated_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .get(application.id, 'Completed', 'analysis-run', '2026-01-02', '2026-01-02', '2026-01-02') as {
    id: number
  }
  const skipSkill = sqlite
    .query(
      `INSERT INTO skills (key, name, review_status, origin, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .get('kafka', 'Kafka', 'pending', 'job-parser', '2026-01-01', '2026-01-01') as { id: number }
  const includeSkill = sqlite
    .query(
      `INSERT INTO skills (key, name, review_status, origin, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .get('grpc', 'gRPC', 'pending', 'job-parser', '2026-01-01', '2026-01-01') as { id: number }
  const pendingSkill = sqlite
    .query(
      `INSERT INTO skills (key, name, review_status, origin, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .get('rust', 'Rust', 'pending', 'job-parser', '2026-01-01', '2026-01-01') as { id: number }

  sqlite
    .query(
      `INSERT INTO job_applications_to_skills (
        job_application_id, skill_id, importance, analysis_result, user_decision,
        decision_reason, created_at, updated_at
      ) VALUES (?, ?, 'mentioned', 'not-in-career-data', 'skip', NULL, '2026-01-01', '2026-01-01')`,
    )
    .run(application.id, skipSkill.id)
  sqlite
    .query(
      `INSERT INTO job_applications_to_skills (
        job_application_id, skill_id, importance, analysis_result, user_decision,
        decision_reason, created_at, updated_at
      ) VALUES (?, ?, 'mentioned', 'not-in-career-data', 'include', ?, '2026-01-01', '2026-01-01')`,
    )
    .run(application.id, includeSkill.id, 'Used in a personal gRPC prototype.')
  sqlite
    .query(
      `INSERT INTO job_applications_to_skills (
        job_application_id, skill_id, importance, analysis_result, user_decision,
        decision_reason, created_at, updated_at
      ) VALUES (?, ?, 'mentioned', 'not-in-career-data', 'pending', NULL, '2026-01-01', '2026-01-01')`,
    )
    .run(application.id, pendingSkill.id)

  return { runId: run.id }
}

describe('run-scoped decision migration', () => {
  test('creates the decisions table on an empty database', () => {
    const sqlite = migratedDatabase()
    try {
      const tables = sqlite
        .query("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((row) => String((row as { name: string }).name))
      expect(tables).toContain('analysis_run_decisions')
      expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
    } finally {
      sqlite.close()
    }
  })

  test('backfills only unambiguous legacy decisions to the latest completed run', () => {
    const folder = migrationFolderUpTo(17)
    const sqlite = migratedAt(folder)
    try {
      const { runId } = seedLegacyDecisions(sqlite)

      migrate(drizzle({ client: sqlite }), { migrationsFolder: './drizzle' })

      const rows = sqlite
        .query(
          `SELECT d.decision, d.reason, s.name AS skill
           FROM analysis_run_decisions AS d
           JOIN skills AS s ON s.id = d.skill_id
           WHERE d.application_analysis_run_id = ? ORDER BY s.name`,
        )
        .all(runId) as Array<{ decision: string; reason: string | null; skill: string }>
      expect(rows).toEqual([
        { decision: 'skip', reason: null, skill: 'Kafka' },
        { decision: 'include', reason: 'Used in a personal gRPC prototype.', skill: 'gRPC' },
      ])
      // The pending legacy row is never silently approved.
      expect(rows.some((row) => row.skill === 'Rust')).toBe(false)
      expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
    } finally {
      sqlite.close()
      rmSync(folder, { force: true, recursive: true })
    }
  })
})
