import { describe, expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { jobPostingAnalysisIdForCandidateRun } from '../../src/db/analysis-lineage'
import { persistJobRequirements } from '../../src/db/job-analysis'
import * as schema from '../../src/db/schema'
import { listRequirementSkillMappings } from '../../src/db/skill-queries'
import type { CatalogContextEntry } from '../../src/lib/skills/catalog-context'
import { skillDecisionSchema } from '../../src/lib/validation'
import { migratedDatabase } from '../support/sqlite'

const suppliedCatalog: CatalogContextEntry[] = [
  { key: 'react', name: 'React', category: 'frontend', aliases: ['React.js'] },
]

function database() {
  const sqlite = migratedDatabase()
  return { sqlite, db: drizzle({ client: sqlite, schema }) }
}

function seedAnalysis(sqlite: ReturnType<typeof database>['sqlite']): number {
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
  return analysis.id
}

describe('canonical requirement-skill persistence', () => {
  test('maps a verified requirement term into the canonical junction', () => {
    const { sqlite, db } = database()
    try {
      const analysisId = seedAnalysis(sqlite)
      sqlite
        .query(
          `INSERT INTO skills (key, name, category, review_status, origin, created_at, updated_at)
           VALUES ('react', 'React', 'frontend', 'approved', 'career-data', '2026-08-28', '2026-08-28')`,
        )
        .run()
      persistJobRequirements(
        db,
        analysisId,
        [
          {
            type: 'skill',
            importance: 'required',
            basis: 'explicit',
            statement: 'React experience.',
            sourceText: 'React experience',
            inferenceRationale: null,
            terms: [{ term: 'React', sourceText: 'React experience', confidence: 0.9 }],
          },
        ],
        '2026-08-28',
        suppliedCatalog,
      )
      const mappings = listRequirementSkillMappings(analysisId, db)
      expect(mappings).toHaveLength(1)
      expect(mappings[0].skillName).toBe('React')
      expect(mappings[0].rawLabel).toBe('React')
    } finally {
      sqlite.close()
    }
  })

  test('resolves the exact Job Analysis through candidate-run lineage when IDs differ', () => {
    const { sqlite, db } = database()
    try {
      const jobPostingAnalysisId = seedAnalysis(sqlite)
      persistJobRequirements(
        db,
        jobPostingAnalysisId,
        [
          {
            type: 'skill',
            importance: 'required',
            basis: 'explicit',
            statement: 'React experience.',
            sourceText: 'React experience',
            inferenceRationale: null,
            terms: [{ term: 'React', sourceText: 'React experience', confidence: 0.9 }],
          },
        ],
        '2026-08-28',
      )
      sqlite
        .query(
          `INSERT INTO application_analysis_runs (
            job_posting_analysis_id, queue_job_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?)`,
        )
        .run(jobPostingAnalysisId, 'candidate-dummy', '2026-08-28', '2026-08-28')
      const candidateRun = sqlite
        .query(
          `INSERT INTO application_analysis_runs (
            job_posting_analysis_id, queue_job_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?) RETURNING id`,
        )
        .get(jobPostingAnalysisId, 'candidate-current', '2026-08-28', '2026-08-28') as {
        id: number
      }

      expect(candidateRun.id).not.toBe(jobPostingAnalysisId)
      expect(jobPostingAnalysisIdForCandidateRun(candidateRun.id, db)).toBe(jobPostingAnalysisId)
    } finally {
      sqlite.close()
    }
  })

  test('forged Include decisions without a reason fail the server schema', () => {
    expect(skillDecisionSchema.safeParse({ action: 'include', reason: '' }).success).toBe(false)
    expect(skillDecisionSchema.safeParse({ action: 'skip', reason: '' }).success).toBe(true)
    expect(
      skillDecisionSchema.safeParse({
        action: 'include',
        reason: 'Used this in a personal event-processing prototype.',
      }).success,
    ).toBe(true)
  })
})
