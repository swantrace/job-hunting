import { describe, expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { completeJobAnalysisRun, createJobAnalysisRun } from '../../src/db/job-analysis-runs'
import * as schema from '../../src/db/schema'
import { listRequirementSkillMappings } from '../../src/db/skill-queries'
import { migratedDatabase } from '../support/sqlite'

/**
 * End-to-end canonical lineage smoke test: Job Analysis -> Candidate Analysis
 * -> Generation, each run referencing the exact upstream run by foreign key and
 * never a redundant application FK.
 */

function seedPosting(sqlite: ReturnType<typeof migratedDatabase>) {
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
      `INSERT INTO job_postings (job_application_id, version, raw_text, captured_at, content_hash)
       VALUES (?, 1, ?, '2026-08-28', ?) RETURNING id`,
    )
    .get(application.id, 'Engineer role with Kafka.', 'hash') as { id: number }
  return posting.id
}

describe('canonical application workflow', () => {
  test('runs Job Analysis, Candidate Analysis, and Generation through explicit lineage', () => {
    const sqlite = migratedDatabase()
    try {
      const db = drizzle({ client: sqlite, schema })
      const postingId = seedPosting(sqlite)

      const jobRun = createJobAnalysisRun(db, {
        jobPostingId: postingId,
        inputHash: 'job-input-hash',
        frozenInputJson: '{}',
        model: 'gpt-test',
        promptVersion: '3.0.0',
        schemaVersion: '4.0.0',
      })
      completeJobAnalysisRun(db, jobRun.id, {
        jobTitle: 'Engineer',
        location: null,
        postedDate: null,
        salary: null,
        analysis: {
          summary: { rolePurpose: 'Build services.', idealCandidate: 'An engineer.' },
          classification: {
            roleType: 'backend',
            advertisedSeniority: 'intermediate',
            practicalSeniority: 'intermediate',
            rationale: 'Services ownership.',
            functionalEmphasis: {
              frontend: 0,
              backend: 50,
              testingQuality: 15,
              devopsInfrastructure: 20,
              collaborationOwnership: 15,
            },
          },
          requirements: [
            {
              type: 'skill',
              importance: 'required',
              basis: 'explicit',
              statement: 'Kafka experience.',
              sourceText: 'Kafka experience',
              inferenceRationale: null,
              skillReferences: [
                {
                  rawLabel: 'Kafka',
                  canonicalLabel: 'Kafka',
                  category: 'messaging-async',
                  confidence: 0.9,
                },
              ],
            },
          ],
          painPoints: [],
          culture: [],
          redFlags: [],
          successMetrics: [],
          benefits: [],
          notes: null,
          interviewQuestions: [],
        },
        parserModel: 'gpt-test',
        parserPromptVersion: '3.0.0',
        analysisPromptVersion: '4.0.0',
      })

      expect(listRequirementSkillMappings(jobRun.id, db)).toHaveLength(1)

      const candidateRun = sqlite
        .query(
          `INSERT INTO application_analysis_runs (
            job_posting_analysis_id, status, queue_job_id, created_at, updated_at
          ) VALUES (?, 'Completed', 'candidate-1', '2026-08-28', '2026-08-28') RETURNING id`,
        )
        .get(jobRun.id) as { id: number }
      expect(
        sqlite
          .query('SELECT job_posting_analysis_id FROM application_analysis_runs WHERE id = ?')
          .get(candidateRun.id),
      ).toEqual({ job_posting_analysis_id: jobRun.id })

      const generationRun = sqlite
        .query(
          `INSERT INTO generation_runs (
            application_analysis_run_id, status, queue_job_id, created_at, updated_at
          ) VALUES (?, 'Completed', 'generation-1', '2026-08-28', '2026-08-28') RETURNING id`,
        )
        .get(candidateRun.id) as { id: number }
      expect(
        sqlite
          .query('SELECT application_analysis_run_id FROM generation_runs WHERE id = ?')
          .get(generationRun.id),
      ).toEqual({ application_analysis_run_id: candidateRun.id })

      expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
      expect(sqlite.query('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' })
    } finally {
      sqlite.close()
    }
  })
})
