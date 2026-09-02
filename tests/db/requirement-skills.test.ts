import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { persistJobRequirements } from '../../src/db/job-analysis'
import { completeJobAnalysisRun, createJobAnalysisRun } from '../../src/db/job-analysis-runs'
import * as schema from '../../src/db/schema'
import { listRequirementSkillMappings } from '../../src/db/skill-queries'
import { migratedDatabase } from '../support/sqlite'

/**
 * Canonical requirement-skill persistence contract: requirement-owned skill
 * references are persisted into `job_requirements_to_skills` with raw labels
 * and confidence, and application skill summaries derive from the current Job
 * Analysis requirements rather than `job_applications_to_skills`.
 */

function seedPosting(sqlite: Database): { postingId: number; applicationId: number } {
  const company = sqlite
    .query('INSERT INTO companies (name, created_at, updated_at) VALUES (?, ?, ?) RETURNING id')
    .get('Example Company', '2026-08-28', '2026-08-28') as { id: number }
  const application = sqlite
    .query(
      `INSERT INTO job_applications (
        company_id, job_title, direction, posted_date, priority, status, created_at, updated_at
      ) VALUES (?, ?, 'fullstack', '2026-08-28', 'B', 'Saved', '2026-08-28', '2026-08-28') RETURNING id`,
    )
    .get(company.id, 'Platform Engineer') as { id: number }
  const posting = sqlite
    .query(
      `INSERT INTO job_postings (job_application_id, raw_text, captured_at, content_hash)
       VALUES (?, ?, '2026-08-28', ?) RETURNING id`,
    )
    .get(application.id, 'Platform engineer role.', 'posting-hash') as { id: number }
  return { postingId: posting.id, applicationId: application.id }
}

function seedAnalysis(sqlite: Database, postingId: number): number {
  const analysis = sqlite
    .query(
      'INSERT INTO job_posting_analyses (job_posting_id, created_at, updated_at) VALUES (?, ?, ?) RETURNING id',
    )
    .get(postingId, '2026-08-28', '2026-08-28') as { id: number }
  return analysis.id
}

describe('canonical requirement-skill persistence', () => {
  test('persists junction rows with raw label and confidence and creates pending skills', () => {
    const sqlite = migratedDatabase()
    try {
      const db = drizzle({ client: sqlite })
      const { postingId } = seedPosting(sqlite)
      const analysisId = seedAnalysis(sqlite, postingId)

      persistJobRequirements(
        db,
        analysisId,
        [
          {
            type: 'skill',
            importance: 'required',
            basis: 'explicit',
            statement: 'Experience with Apache Kafka.',
            sourceText: 'Experience with Apache Kafka',
            inferenceRationale: null,
            skillReferences: [
              {
                rawLabel: 'Apache Kafka',
                canonicalLabel: 'Kafka',
                category: 'messaging-async',
                confidence: 0.96,
              },
            ],
          },
        ],
        '2026-08-28',
      )

      const links = sqlite
        .query(
          `SELECT r.statement, s.name, s.review_status, s.origin, j.raw_label, j.confidence
           FROM job_requirements_to_skills AS j
           JOIN job_requirements AS r ON r.id = j.job_requirement_id
           JOIN skills AS s ON s.id = j.skill_id`,
        )
        .all() as Array<{
        statement: string
        name: string
        review_status: string
        origin: string
        raw_label: string
        confidence: number
      }>
      expect(links).toHaveLength(1)
      expect(links[0]).toMatchObject({
        statement: 'Experience with Apache Kafka.',
        name: 'Kafka',
        review_status: 'pending',
        origin: 'job-parser',
        raw_label: 'Apache Kafka',
        confidence: 0.96,
      })
      expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
    } finally {
      sqlite.close()
    }
  })

  test('maps one skill to multiple requirements without losing requirement context', () => {
    const sqlite = migratedDatabase()
    try {
      const db = drizzle({ client: sqlite })
      const { postingId } = seedPosting(sqlite)
      const analysisId = seedAnalysis(sqlite, postingId)

      persistJobRequirements(
        db,
        analysisId,
        [
          {
            type: 'skill',
            importance: 'required',
            basis: 'explicit',
            statement: 'Strong Kafka experience.',
            sourceText: 'Strong Kafka experience',
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
          {
            type: 'experience',
            importance: 'preferred',
            basis: 'explicit',
            statement: 'Operated Kafka at scale.',
            sourceText: 'Operated Kafka at scale',
            inferenceRationale: null,
            skillReferences: [
              {
                rawLabel: 'Kafka',
                canonicalLabel: 'Kafka',
                category: 'messaging-async',
                confidence: 0.8,
              },
            ],
          },
        ],
        '2026-08-28',
      )

      const mappings = listRequirementSkillMappings(analysisId, db)
      expect(mappings).toHaveLength(2)
      expect(new Set(mappings.map((item) => item.skillId)).size).toBe(1)
      expect(mappings.map((item) => item.importance).sort()).toEqual(['preferred', 'required'])
      expect(mappings.every((item) => item.requirementStatement !== '')).toBe(true)
      expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
    } finally {
      sqlite.close()
    }
  })

  test('reuses an approved skill instead of creating a duplicate', () => {
    const sqlite = migratedDatabase()
    try {
      const db = drizzle({ client: sqlite })
      const { postingId } = seedPosting(sqlite)
      const analysisId = seedAnalysis(sqlite, postingId)
      sqlite
        .query(
          `INSERT INTO skills (key, name, category, review_status, origin, created_at, updated_at)
           VALUES ('kafka', 'Kafka', 'messaging-async', 'approved', 'career-data', '2026-08-28', '2026-08-28')`,
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
            statement: 'Kafka experience.',
            sourceText: 'Kafka experience',
            inferenceRationale: null,
            skillReferences: [
              {
                rawLabel: 'Kafka',
                canonicalLabel: 'Kafka',
                category: 'messaging-async',
                confidence: 0.95,
              },
            ],
          },
        ],
        '2026-08-28',
      )

      const count = sqlite
        .query("SELECT count(*) AS count FROM skills WHERE key = 'kafka'")
        .get() as {
        count: number
      }
      expect(count.count).toBe(1)
      const mappings = listRequirementSkillMappings(analysisId, db)
      expect(mappings[0].reviewStatus).toBe('approved')
    } finally {
      sqlite.close()
    }
  })

  test('completes a run transactionally with junction rows and no application-skill table writes', () => {
    const sqlite = migratedDatabase()
    try {
      const db = drizzle({ client: sqlite, schema })
      const { postingId, applicationId } = seedPosting(sqlite)
      const run = createJobAnalysisRun(db, {
        jobPostingId: postingId,
        inputHash: 'input-hash',
        frozenInputJson: '{}',
        model: 'gpt-test',
        promptVersion: '3.0.0',
        schemaVersion: '4.0.0',
      })

      completeJobAnalysisRun(db, run.id, {
        jobTitle: 'Platform Engineer',
        location: null,
        postedDate: null,
        salary: null,
        direction: 'fullstack',
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
        parserModel: 'gpt-test',
        parserPromptVersion: '3.0.0',
        analysisPromptVersion: '4.0.0',
      })

      const completed = sqlite
        .query('SELECT result_json, schema_version FROM job_posting_analyses WHERE id = ?')
        .get(run.id) as { result_json: string | null; schema_version: string | null }
      expect(completed.result_json).toContain('Kafka')
      expect(completed.schema_version).toBe('4.0.0')

      const mappings = listRequirementSkillMappings(run.id, db)
      expect(mappings).toHaveLength(1)

      // The legacy application-skill table no longer exists.
      const tables = sqlite
        .query("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((row) => String((row as { name: string }).name))
      expect(tables).not.toContain('job_applications_to_skills')
      expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
    } finally {
      sqlite.close()
    }
  })
})
