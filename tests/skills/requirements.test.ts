import { describe, expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { jobPostingAnalysisIdForCandidateRun } from '../../src/db/analysis-lineage'
import { persistJobRequirements } from '../../src/db/job-analysis'
import { listRequirementSkillMappings } from '../../src/db/skill-queries'
import { skillDecisionSchema } from '../../src/lib/validation'
import { migratedDatabase } from '../support/sqlite'

function database() {
  const sqlite = migratedDatabase()
  return { sqlite, db: drizzle({ client: sqlite }) }
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
  test('persists requirement-owned skills into the canonical junction', () => {
    const { sqlite, db } = database()
    try {
      const analysisId = seedAnalysis(sqlite)
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
            skillReferences: [
              { rawLabel: 'React', canonicalLabel: 'React', category: 'frontend', confidence: 0.9 },
            ],
          },
        ],
        '2026-08-28',
      )
      const mappings = listRequirementSkillMappings(analysisId, db)
      expect(mappings).toHaveLength(1)
      expect(mappings[0].skillName).toBe('React')
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
            skillReferences: [
              { rawLabel: 'React', canonicalLabel: 'React', category: 'frontend', confidence: 0.9 },
            ],
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
