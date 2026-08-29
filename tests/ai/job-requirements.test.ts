import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { persistJobRequirements } from '../../src/db/job-analysis'
import { migratedDatabase } from '../support/sqlite'

function createBaselineMigrationFolder(lastMigrationIndex: number) {
  const root = mkdtempSync(resolve(tmpdir(), 'job-tracker-requirements-baseline-'))
  const metaDirectory = resolve(root, 'meta')
  mkdirSync(metaDirectory)
  for (let index = 0; index <= lastMigrationIndex; index += 1) {
    const prefix = `${String(index).padStart(4, '0')}_`
    const fileName = Array.from(new Bun.Glob(`${prefix}*.sql`).scanSync('drizzle'))[0]
    if (!fileName) throw new Error(`Missing baseline migration with prefix ${prefix}.`)
    cpSync(resolve('drizzle', fileName), resolve(root, fileName))
  }
  const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')) as {
    entries: Array<{ idx: number }>
  }
  journal.entries = journal.entries.filter((entry) => entry.idx <= lastMigrationIndex)
  writeFileSync(resolve(metaDirectory, '_journal.json'), JSON.stringify(journal))
  return root
}

function seedLegacyAnalysis(sqlite: Database) {
  const company = sqlite
    .query('INSERT INTO companies (name, created_at) VALUES (?, ?) RETURNING id')
    .get('Example Company', '2026-08-28') as { id: number }
  const application = sqlite
    .query(
      `INSERT INTO job_applications (
        company_id, job_title, direction, posted_date, priority, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .get(
      company.id,
      'Software Engineer',
      'fullstack',
      '2026-08-28',
      'B',
      'Saved',
      '2026-08-28',
      '2026-08-28',
    ) as { id: number }
  const posting = sqlite
    .query(
      `INSERT INTO job_postings (
        job_application_id, raw_text, captured_at, content_hash
      ) VALUES (?, ?, ?, ?) RETURNING id`,
    )
    .get(application.id, 'A legacy job post', '2026-08-28', 'hash') as { id: number }
  sqlite
    .query(
      `INSERT INTO job_posting_analyses (
        job_posting_id, requirements, responsibilities, generated_at, model, prompt_version
      ) VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .get(
      posting.id,
      'Node.js experience\nTypeScript experience\nAutomated testing',
      'Build APIs',
      '2026-08-28',
      'gpt-5-mini',
      '2.2.0',
    ) as { id: number }
  return { applicationId: application.id, postingId: posting.id }
}

describe('structured job requirements migration', () => {
  test('creates job_requirements and junction tables with text date columns', () => {
    const sqlite = migratedDatabase()
    try {
      const tables = sqlite
        .query("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((row) => String((row as { name: string }).name))
      expect(tables).toContain('job_requirements')
      expect(tables).toContain('job_requirements_to_skills')

      const columns = sqlite.query("PRAGMA table_info('job_requirements')").all() as Array<{
        name: string
        type: string
      }>
      for (const column of columns) {
        if (column.name.endsWith('_at')) expect(column.type.toUpperCase()).toBe('TEXT')
      }

      const analysisColumns = sqlite
        .query("PRAGMA table_info('job_posting_analyses')")
        .all() as Array<{
        name: string
      }>
      for (const name of [
        'summary',
        'role_type',
        'advertised_seniority',
        'practical_seniority',
        'classification_rationale',
        'functional_emphasis_json',
        'interview_questions_json',
        'schema_version',
      ]) {
        expect(analysisColumns.some((column) => column.name === name)).toBe(true)
      }
    } finally {
      sqlite.close()
    }
  })

  test('backfills legacy line-based requirements as ordered legacy rows', () => {
    const baselineFolder = createBaselineMigrationFolder(12)
    const sqlite = new Database(':memory:')
    sqlite.exec('PRAGMA foreign_keys = ON;')
    migrate(drizzle({ client: sqlite }), { migrationsFolder: baselineFolder })
    try {
      seedLegacyAnalysis(sqlite)
      migrate(drizzle({ client: sqlite }), { migrationsFolder: './drizzle' })

      const rows = sqlite
        .query(
          `SELECT sequence, basis, statement, source_text
           FROM job_requirements
           ORDER BY sequence`,
        )
        .all() as Array<{ sequence: number; basis: string; statement: string; source_text: null }>
      expect(rows).toHaveLength(3)
      expect(rows[0]).toMatchObject({
        sequence: 1,
        basis: 'legacy',
        statement: 'Node.js experience',
        source_text: null,
      })
      expect(rows[2].statement).toBe('Automated testing')
      expect(rows.every((row) => row.source_text === null)).toBe(true)
    } finally {
      sqlite.close()
      rmSync(baselineFolder, { force: true, recursive: true })
    }
  })

  test('persists structured requirements in deterministic posting order', () => {
    const sqlite = migratedDatabase()
    const db = drizzle({ client: sqlite })
    try {
      const company = sqlite
        .query('INSERT INTO companies (name, created_at) VALUES (?, ?) RETURNING id')
        .get('Example Company', '2026-08-28') as { id: number }
      const application = sqlite
        .query(
          `INSERT INTO job_applications (
            company_id, job_title, direction, posted_date, priority, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        )
        .get(
          company.id,
          'Software Engineer',
          'fullstack',
          '2026-08-28',
          'B',
          'Saved',
          '2026-08-28',
          '2026-08-28',
        ) as { id: number }
      const posting = sqlite
        .query(
          `INSERT INTO job_postings (
            job_application_id, raw_text, captured_at, content_hash
          ) VALUES (?, ?, ?, ?) RETURNING id`,
        )
        .get(application.id, 'A job post', '2026-08-28', 'hash') as { id: number }
      const analysis = sqlite
        .query(
          `INSERT INTO job_posting_analyses (job_posting_id, generated_at)
           VALUES (?, ?) RETURNING id`,
        )
        .get(posting.id, '2026-08-28') as { id: number }

      persistJobRequirements(
        db,
        analysis.id,
        [
          {
            type: 'skill',
            importance: 'required',
            basis: 'explicit',
            statement: 'Node.js experience',
            sourceText: 'Node.js experience',
            inferenceRationale: null,
          },
          {
            type: 'responsibility',
            importance: 'preferred',
            basis: 'inferred',
            statement: 'Autonomous delivery',
            sourceText: 'minimal supervision',
            inferenceRationale: 'Minimal supervision implies autonomy.',
          },
        ],
        '2026-08-28',
      )

      const rows = sqlite
        .query('SELECT sequence, requirement_type, basis FROM job_requirements ORDER BY sequence')
        .all() as Array<{ sequence: number; requirement_type: string; basis: string }>
      expect(rows.map((row) => row.sequence)).toEqual([1, 2])
      expect(rows[0].requirement_type).toBe('skill')
      expect(rows[1].basis).toBe('inferred')
    } finally {
      sqlite.close()
    }
  })
})
