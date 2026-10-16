import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { jobAnalysisSchemaVersion } from '../../src/ai/schemas/job-analysis'
import { persistJobRequirements } from '../../src/db/job-analysis'
import { completeJobAnalysisRun, createJobAnalysisRun } from '../../src/db/job-analysis-runs'
import * as schema from '../../src/db/schema'
import { countPendingMentions, listRequirementMentions } from '../../src/db/skill-mentions'
import { listRequirementSkillMappings } from '../../src/db/skill-queries'
import { jobAnalysisInputFromContent } from '../../src/lib/job-analysis/input'
import type { CatalogContextEntry } from '../../src/lib/skills/catalog-context'
import { migratedDatabase } from '../support/sqlite'

/**
 * Canonical requirement-term persistence contract (): requirement-owned
 * raw terms are stored as mentions, a verified catalog match writes the
 * `job_requirements_to_skills` junction through `mapMention`, and persistence
 * never creates a catalog skill, alias or category.
 */

/** The raw posting the run is frozen against; retrieval reads only this text. */
const postingText = 'Platform engineer role with Kafka.'

/** The bounded catalog a run supplies for this posting. */
const suppliedCatalog: CatalogContextEntry[] = [
  { key: 'kafka', name: 'Kafka', category: 'messaging-async', aliases: [] },
]

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
    .get(application.id, postingText, 'posting-hash') as { id: number }
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

function seedApprovedKafka(sqlite: Database): number {
  return (
    sqlite
      .query(
        `INSERT INTO skills (key, name, category, review_status, origin, created_at, updated_at)
     VALUES ('kafka', 'Kafka', 'messaging-async', 'approved', 'career-data', '2026-08-28', '2026-08-28')
     RETURNING id`,
      )
      .get() as { id: number }
  ).id
}

function requirement(statement: string, term: string, confidence: number) {
  return {
    type: 'skill' as const,
    importance: 'required' as const,
    basis: 'explicit' as const,
    statement,
    sourceText: statement,
    inferenceRationale: null,
    terms: [{ term, sourceText: statement, confidence, key: null }],
  }
}

describe('canonical requirement-term persistence', () => {
  test('stores an unknown term with a pending catalog record, without personal evidence', () => {
    const sqlite = migratedDatabase()
    try {
      const db = drizzle({ client: sqlite, schema })
      const { postingId } = seedPosting(sqlite)
      const analysisId = seedAnalysis(sqlite, postingId)

      persistJobRequirements(
        db,
        analysisId,
        [requirement('Experience with Apache Kafka.', 'Apache Kafka', 0.96)],
        '2026-08-28',
        suppliedCatalog,
      )

      expect(listRequirementSkillMappings(analysisId, db)).toHaveLength(1)
      expect(countPendingMentions(db, analysisId)).toBe(0)
      const [mention] = listRequirementMentions(
        db,
        (sqlite.query('SELECT id FROM job_requirements').get() as { id: number }).id,
      )
      expect(mention).toMatchObject({
        rawTerm: 'Apache Kafka',
        normalizedTerm: 'apache kafka',
        mappingState: 'mapped',
        resolvedSkillId: expect.any(Number),
      })
      expect(mention.occurrences[0]).toMatchObject({
        source: 'job-analysis',
        provenance: 'job-parser',
        context: 'Experience with Apache Kafka.',
        confidence: 0.96,
      })
      expect(sqlite.query('SELECT count(*) AS count FROM skills').get()).toEqual({ count: 1 })
      expect(sqlite.query('SELECT review_status FROM skills').get()).toEqual({
        review_status: 'pending',
      })
      expect(sqlite.query('SELECT count(*) AS count FROM skill_aliases').get()).toEqual({
        count: 0,
      })
      expect(sqlite.query('SELECT count(*) AS count FROM career_skills').get()).toEqual({
        count: 0,
      })
      expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
    } finally {
      sqlite.close()
    }
  })

  test('maps one verified skill to multiple requirements without losing requirement context', () => {
    const sqlite = migratedDatabase()
    try {
      const db = drizzle({ client: sqlite, schema })
      const { postingId } = seedPosting(sqlite)
      const analysisId = seedAnalysis(sqlite, postingId)
      seedApprovedKafka(sqlite)

      persistJobRequirements(
        db,
        analysisId,
        [
          {
            ...requirement('Strong Kafka experience.', 'Kafka', 0.9),
            importance: 'required' as const,
          },
          {
            ...requirement('Operated Kafka at scale.', 'Kafka', 0.8),
            type: 'experience' as const,
            importance: 'preferred' as const,
          },
        ],
        '2026-08-28',
        suppliedCatalog,
      )

      const mappings = listRequirementSkillMappings(analysisId, db)
      expect(mappings).toHaveLength(2)
      expect(new Set(mappings.map((item) => item.skillId)).size).toBe(1)
      expect(mappings.map((item) => item.importance).sort()).toEqual(['preferred', 'required'])
      expect(mappings.map((item) => item.rawLabel)).toEqual(['Kafka', 'Kafka'])
      expect(mappings.every((item) => item.requirementStatement !== '')).toBe(true)
      expect(countPendingMentions(db, analysisId)).toBe(0)
      expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
    } finally {
      sqlite.close()
    }
  })

  test('reuses an approved catalog skill instead of creating a duplicate', () => {
    const sqlite = migratedDatabase()
    try {
      const db = drizzle({ client: sqlite, schema })
      const { postingId } = seedPosting(sqlite)
      const analysisId = seedAnalysis(sqlite, postingId)
      seedApprovedKafka(sqlite)

      persistJobRequirements(
        db,
        analysisId,
        [requirement('Kafka experience.', 'Kafka', 0.95)],
        '2026-08-28',
        suppliedCatalog,
      )

      const count = sqlite
        .query("SELECT count(*) AS count FROM skills WHERE key = 'kafka'")
        .get() as {
        count: number
      }
      expect(count.count).toBe(1)
      const mappings = listRequirementSkillMappings(analysisId, db)
      expect(mappings[0]).toMatchObject({ reviewStatus: 'approved', confidence: 0.95 })
    } finally {
      sqlite.close()
    }
  })

  test('completes a run transactionally with mappings and no application-skill table writes', () => {
    const sqlite = migratedDatabase()
    try {
      const db = drizzle({ client: sqlite, schema })
      const { postingId, applicationId } = seedPosting(sqlite)
      seedApprovedKafka(sqlite)
      const identity = jobAnalysisInputFromContent('posting-hash', postingText, db)
      const run = createJobAnalysisRun(db, {
        jobPostingId: postingId,
        inputHash: identity.inputHash,
        frozenInputJson: JSON.stringify(identity.snapshot),
        model: 'gpt-test',
        promptVersion: '4.0.0',
        schemaVersion: jobAnalysisSchemaVersion,
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
              terms: [
                { term: 'Kafka', sourceText: 'Kafka experience', confidence: 0.95, key: null },
              ],
            },
            {
              type: 'skill',
              importance: 'mentioned',
              basis: 'explicit',
              statement: 'Kubernetes exposure.',
              sourceText: 'Kubernetes exposure',
              inferenceRationale: null,
              terms: [
                {
                  term: 'Kubernetes',
                  sourceText: 'Kubernetes exposure',
                  confidence: null,
                  key: 'kubernetes',
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
        parserPromptVersion: '4.0.0',
        analysisPromptVersion: '5.0.0',
      })

      const completed = sqlite
        .query('SELECT result_json, schema_version FROM job_posting_analyses WHERE id = ?')
        .get(run.id) as { result_json: string | null; schema_version: string | null }
      expect(completed.result_json).toContain('Kafka')
      expect(completed.schema_version).toBe(jobAnalysisSchemaVersion)

      const mappings = listRequirementSkillMappings(run.id, db)
      expect(mappings).toHaveLength(2)
      expect(mappings[0].skillKey).toBe('kafka')
      // The forged Kubernetes key created no catalog record and stays pending.
      expect(countPendingMentions(db, run.id)).toBe(0)
      expect(
        sqlite.query("SELECT count(*) AS count FROM skills WHERE key = 'kubernetes'").get(),
      ).toEqual({ count: 1 })

      // The legacy application-skill table no longer exists.
      const tables = sqlite
        .query("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((row) => String((row as { name: string }).name))
      expect(tables).not.toContain('job_applications_to_skills')
      expect(applicationId).toBeGreaterThan(0)
      expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
    } finally {
      sqlite.close()
    }
  })
})
