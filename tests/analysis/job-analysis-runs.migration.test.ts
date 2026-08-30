import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import * as schema from '../../src/db/schema'
import { migratedDatabase } from '../support/sqlite'

/**
 * Job Analysis run-history migration contract. Verifies the append-only
 * `job_posting_analyses` migration on empty and populated temporary databases
 * without touching the developer's `jobs.db` or invoking an LLM.
 */
const jobAnalysisRunColumns = [
  'status',
  'queue_job_id',
  'attempts',
  'input_hash',
  'frozen_input_json',
  'error_message',
  'created_at',
  'updated_at',
  'started_at',
  'completed_at',
]

function migrationFolderUpTo(lastIndex: number) {
  const root = mkdtempSync(resolve(tmpdir(), 'job-tracker-migration-'))
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

function seedPopulatedAnalysis(sqlite: Database) {
  const company = sqlite
    .query('INSERT INTO companies (name, created_at) VALUES (?, ?) RETURNING id')
    .get('Example Company', '2026-01-01') as { id: number }
  const application = sqlite
    .query(
      `INSERT INTO job_applications (
        company_id, job_title, direction, posted_date, priority, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .get(
      company.id,
      'Frontend Developer',
      'fullstack',
      '2026-01-01',
      'B',
      'Saved',
      '2026-01-01',
      '2026-01-01',
    ) as { id: number }
  const posting = sqlite
    .query(
      `INSERT INTO job_postings (job_application_id, raw_text, captured_at, content_hash)
       VALUES (?, ?, ?, ?) RETURNING id`,
    )
    .get(application.id, 'Raw job post', '2026-01-01', 'posting-hash') as { id: number }
  const analysis = sqlite
    .query(
      `INSERT INTO job_posting_analyses (
        job_posting_id, requirements, generated_at, model, prompt_version, schema_version
      ) VALUES (?, ?, ?, ?, ?, NULL) RETURNING id`,
    )
    .get(posting.id, 'Kafka\nReact', '2026-01-01', 'gpt-legacy', '2.1.0') as { id: number }
  sqlite
    .query(
      `INSERT INTO job_requirements (
        job_posting_analysis_id, sequence, requirement_type, importance, basis, statement,
        source_text, inference_rationale, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?) RETURNING id`,
    )
    .get(analysis.id, 1, 'experience', 'mentioned', 'legacy', 'Kafka', '2026-01-01', '2026-01-01')
  return { analysisId: analysis.id, postingId: posting.id, applicationId: application.id }
}

describe('job posting analysis run-history migration', () => {
  test('adds run columns and drops the one-analysis-per-posting index on an empty database', () => {
    const sqlite = migratedDatabase()
    try {
      const columns = sqlite.query("PRAGMA table_info('job_posting_analyses')").all() as Array<{
        name: string
      }>
      const names = columns.map((column) => column.name)
      for (const column of jobAnalysisRunColumns) expect(names).toContain(column)

      const indexes = sqlite.query("PRAGMA index_list('job_posting_analyses')").all() as Array<{
        name: string
      }>
      const indexNames = indexes.map((index) => index.name)
      expect(indexNames).not.toContain('job_posting_analyses_posting_unique_idx')
      expect(indexNames).toContain('job_posting_analyses_queue_job_unique_idx')
      expect(indexNames).toContain('job_posting_analyses_posting_id_idx')
      expect(indexNames).toContain('job_posting_analyses_status_idx')

      expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
    } finally {
      sqlite.close()
    }
  })

  test('backfills existing rows to Completed and preserves legacy requirements', () => {
    const folder = migrationFolderUpTo(16)
    const sqlite = migratedAt(folder)
    try {
      const { analysisId, postingId } = seedPopulatedAnalysis(sqlite)

      migrate(drizzle({ client: sqlite }), { migrationsFolder: './drizzle' })

      const analysis = sqlite
        .query(
          `SELECT status, created_at, updated_at, completed_at, schema_version, requirements
           FROM job_posting_analyses WHERE id = ?`,
        )
        .get(analysisId) as {
        status: string
        created_at: string
        updated_at: string
        completed_at: string | null
        schema_version: string | null
        requirements: string
      }
      expect(analysis.status).toBe('Completed')
      expect(analysis.created_at).toBe('2026-01-01')
      expect(analysis.updated_at).toBe('2026-01-01')
      expect(analysis.completed_at).toBe('2026-01-01')
      expect(analysis.schema_version).toBeNull()
      expect(analysis.requirements).toBe('Kafka\nReact')

      const requirement = sqlite
        .query(
          `SELECT statement, basis, requirement_type, importance
           FROM job_requirements WHERE job_posting_analysis_id = ?`,
        )
        .all(analysisId) as Array<{ statement: string; basis: string }>
      expect(requirement).toHaveLength(1)
      expect(requirement[0].statement).toBe('Kafka')
      expect(requirement[0].basis).toBe('legacy')
      expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])

      // A second analysis for the same posting is now allowed.
      const db = drizzle({ client: sqlite, schema })
      db.insert(schema.jobPostingAnalyses)
        .values({
          jobPostingId: postingId,
          requirements: 'TypeScript',
          generatedAt: '2026-02-01',
          status: 'Queued',
          createdAt: '2026-02-01',
          updatedAt: '2026-02-01',
        })
        .run()
      const count = sqlite
        .query('SELECT count(*) AS count FROM job_posting_analyses WHERE job_posting_id = ?')
        .get(postingId) as { count: number }
      expect(count.count).toBe(2)
    } finally {
      sqlite.close()
      rmSync(folder, { force: true, recursive: true })
    }
  })
})
