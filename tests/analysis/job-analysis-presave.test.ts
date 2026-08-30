import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { jobAnalysisSchemaVersion } from '../../src/ai/schemas/job-analysis'
import { persistCompletedJobAnalysis } from '../../src/db/job-analysis-runs'
import * as schema from '../../src/db/schema'
import { jobAnalysisInputFromContent } from '../../src/lib/job-analysis-input'
import { migratedDatabase } from '../support/sqlite'

/**
 * Pre-save Quick Collect contract: saving a reviewed draft persists a completed
 * Job Analysis run with full input identity and never pays for a redundant
 * rerun. `createApplication` wires this helper into the Quick Collect save.
 */
function seedPosting(sqlite: ReturnType<typeof migratedDatabase>) {
  const company = sqlite
    .query('INSERT INTO companies (name, created_at, updated_at) VALUES (?, ?, ?) RETURNING id')
    .get('Example Corp', '2026-01-01', '2026-01-01') as { id: number }
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
    .get(application.id, 'We need a frontend developer.', '2026-01-01', 'posting-hash') as {
    id: number
  }
  return posting.id
}

describe('pre-save Quick Collect job analysis identity', () => {
  test('saves a completed run with input identity without an AI call', () => {
    const sqlite = migratedDatabase()
    try {
      const db = drizzle({ client: sqlite, schema })
      const jobPostingId = seedPosting(sqlite)
      const identity = jobAnalysisInputFromContent('posting-hash')
      const run = persistCompletedJobAnalysis(db, {
        jobPostingId,
        inputHash: identity.inputHash,
        frozenInputJson: JSON.stringify(identity.snapshot),
        model: 'gpt-test',
        promptVersion: '3.0.0',
        analysis: {
          summary: {
            rolePurpose: 'Build frontend features.',
            idealCandidate: 'A frontend engineer.',
          },
          classification: {
            roleType: 'frontend',
            advertisedSeniority: 'intermediate',
            practicalSeniority: 'intermediate',
            rationale: 'Frontend ownership.',
            functionalEmphasis: {
              frontend: 50,
              backend: 10,
              testingQuality: 15,
              devopsInfrastructure: 10,
              collaborationOwnership: 15,
            },
          },
          requirements: [
            {
              type: 'skill',
              importance: 'required',
              basis: 'explicit',
              statement: 'React experience.',
              sourceText: 'React experience.',
              inferenceRationale: null,
              skillReferences: [
                {
                  rawLabel: 'React',
                  canonicalLabel: 'React',
                  category: 'frontend',
                  confidence: 0.95,
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
        schemaVersion: jobAnalysisSchemaVersion,
        date: '2026-01-01',
      })

      expect(run.status).toBe('Completed')
      expect(run.inputHash).toBe(identity.inputHash)
      expect(run.frozenInputJson).toContain('contentHash')
      expect(run.createdAt).toBe('2026-01-01')
      expect(run.completedAt).toBe('2026-01-01')
      expect(run.schemaVersion).toBe(jobAnalysisSchemaVersion)

      const requirements = db
        .select()
        .from(schema.jobRequirements)
        .where(eq(schema.jobRequirements.jobPostingAnalysisId, run.id))
        .all()
      expect(requirements).toHaveLength(1)
      expect(requirements[0].statement).toBe('React experience.')
      expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
    } finally {
      sqlite.close()
    }
  })
})
