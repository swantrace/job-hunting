import { describe, expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { listCareerGrowthRows } from '../../src/db/career-growth'
import * as schema from '../../src/db/schema'
import { migratedDatabase } from '../support/sqlite'

type Db = ReturnType<typeof migratedDatabase>

function seedCompany(db: Db, name: string): number {
  return (
    db
      .query('INSERT INTO companies (name, created_at, updated_at) VALUES (?, ?, ?) RETURNING id')
      .get(name, '2026-08-28', '2026-08-28') as { id: number }
  ).id
}

function seedApplication(
  db: Db,
  companyId: number,
  status: string,
  direction = 'fullstack',
): number {
  return (
    db
      .query(
        `INSERT INTO job_applications (
          company_id, job_title, direction, posted_date, priority, status, created_at, updated_at
        ) VALUES (?, ?, ?, '2026-08-28', 'B', ?, '2026-08-28', '2026-08-28') RETURNING id`,
      )
      .get(companyId, 'Engineer', direction, status) as { id: number }
  ).id
}

function seedPosting(db: Db, applicationId: number): number {
  return (
    db
      .query(
        `INSERT INTO job_postings (job_application_id, version, raw_text, captured_at, content_hash)
         VALUES (?, 1, 'text', '2026-08-28', ?) RETURNING id`,
      )
      .get(applicationId, `hash-${applicationId}`) as { id: number }
  ).id
}

function seedAnalysis(db: Db, postingId: number): number {
  return (
    db
      .query(
        `INSERT INTO job_posting_analyses (job_posting_id, status, input_hash, frozen_input_json, created_at, updated_at, completed_at)
         VALUES (?, 'Completed', 'hash', '{}', '2026-08-28', '2026-08-28', '2026-08-28') RETURNING id`,
      )
      .get(postingId) as { id: number }
  ).id
}

function seedSkill(db: Db, key: string, name: string): number {
  return (
    db
      .query(
        `INSERT INTO skills (key, name, review_status, origin, created_at, updated_at)
         VALUES (?, ?, 'approved', 'career-data', '2026-08-28', '2026-08-28') RETURNING id`,
      )
      .get(key, name) as { id: number }
  ).id
}

function seedRequirement(
  db: Db,
  analysisId: number,
  sequence: number,
  importance: string,
  statement: string,
): number {
  return (
    db
      .query(
        `INSERT INTO job_requirements (
          job_posting_analysis_id, sequence, requirement_type, importance, basis, statement,
          source_text, created_at, updated_at
        ) VALUES (?, ?, 'skill', ?, 'explicit', ?, ?, '2026-08-28', '2026-08-28') RETURNING id`,
      )
      .get(analysisId, sequence, importance, statement, statement) as { id: number }
  ).id
}

function seedMapping(db: Db, requirementId: number, skillId: number) {
  db.query(
    'INSERT INTO job_requirements_to_skills (job_requirement_id, skill_id, raw_label) VALUES (?, ?, ?)',
  ).get(requirementId, skillId, 'label')
}

function candidateResult(assessments: Array<{ id: number; status: string }>) {
  return JSON.stringify({
    fitRecommendation: 'apply',
    recommendationRationale: 'Reasonable fit.',
    requirementAssessments: assessments.map((assessment) => ({
      jobRequirementId: assessment.id,
      evidenceStatus: assessment.status,
      evidenceRefs:
        assessment.status === 'direct'
          ? [{ sourceType: 'skill', sourceId: 'typescript', relevance: 'direct' }]
          : [],
      explanation: 'Explained.',
      confidence: 0.9,
    })),
    strengths: [],
    concerns: [],
    interviewPreparation: [],
    careerDataSuggestions: [],
  })
}

function seedRun(db: Db, analysisId: number, resultJson: string): number {
  return (
    db
      .query(
        `INSERT INTO application_analysis_runs (
          job_posting_analysis_id, status, queue_job_id, input_hash, input_snapshot_json,
          result_json, created_at, updated_at, completed_at
        ) VALUES (?, 'Completed', ?, 'hash', '{}', ?, '2026-08-28', '2026-08-28', '2026-08-28') RETURNING id`,
      )
      .get(analysisId, `q-${analysisId}`, resultJson) as { id: number }
  ).id
}

function seedDecision(db: Db, runId: number, skillId: number, decision: string) {
  db.query(
    `INSERT INTO analysis_run_decisions (application_analysis_run_id, skill_id, decision, reason, created_at, updated_at)
     VALUES (?, ?, ?, ?, '2026-08-28', '2026-08-28')`,
  ).get(runId, skillId, decision, decision === 'include' ? 'A reason.' : null)
}

describe('career growth aggregation query', () => {
  test('aggregates by canonical skill and excludes Archived/Rejected work', () => {
    const sqlite = migratedDatabase()
    try {
      const db = drizzle({ client: sqlite, schema })
      const company = seedCompany(sqlite, 'Example')
      const activeApp = seedApplication(sqlite, company, 'Saved')
      const rejectedApp = seedApplication(sqlite, company, 'Rejected')

      const activePosting = seedPosting(sqlite, activeApp)
      const rejectedPosting = seedPosting(sqlite, rejectedApp)
      const activeAnalysis = seedAnalysis(sqlite, activePosting)
      const rejectedAnalysis = seedAnalysis(sqlite, rejectedPosting)

      const typescript = seedSkill(sqlite, 'typescript', 'TypeScript')
      const kafka = seedSkill(sqlite, 'kafka', 'Kafka')

      const req1 = seedRequirement(sqlite, activeAnalysis, 1, 'required', 'TypeScript')
      const req2 = seedRequirement(sqlite, activeAnalysis, 2, 'preferred', 'Kafka')
      const req3 = seedRequirement(sqlite, rejectedAnalysis, 1, 'required', 'TypeScript')
      seedMapping(sqlite, req1, typescript)
      seedMapping(sqlite, req2, kafka)
      seedMapping(sqlite, req3, typescript)

      const activeRun = seedRun(
        sqlite,
        activeAnalysis,
        candidateResult([
          { id: req1, status: 'direct' },
          { id: req2, status: 'unknown-evidence' },
        ]),
      )
      seedRun(sqlite, rejectedAnalysis, candidateResult([{ id: req3, status: 'direct' }]))
      seedDecision(sqlite, activeRun, kafka, 'include')

      const rows = listCareerGrowthRows({}, db)
      const typescriptRow = rows.find((row) => row.skillKey === 'typescript')
      const kafkaRow = rows.find((row) => row.skillKey === 'kafka')

      // The Rejected application's requirement must not count toward frequency.
      expect(typescriptRow?.activeApplicationCount).toBe(1)
      expect(typescriptRow?.requiredCount).toBe(1)
      expect(typescriptRow?.verifiedEvidenceCount).toBe(1)

      expect(kafkaRow?.preferredCount).toBe(1)
      expect(kafkaRow?.retainedCount).toBe(1)
      expect(kafkaRow?.verifiedEvidenceCount).toBe(0)
    } finally {
      sqlite.close()
    }
  })

  test('filters rows by direction without writing career data', () => {
    const sqlite = migratedDatabase()
    try {
      const db = drizzle({ client: sqlite, schema })
      const company = seedCompany(sqlite, 'Example')
      const fhirApp = seedApplication(sqlite, company, 'Saved', 'fhir')
      const posting = seedPosting(sqlite, fhirApp)
      const analysis = seedAnalysis(sqlite, posting)
      const skill = seedSkill(sqlite, 'fhir', 'FHIR')
      const req = seedRequirement(sqlite, analysis, 1, 'required', 'FHIR')
      seedMapping(sqlite, req, skill)
      seedRun(sqlite, analysis, candidateResult([{ id: req, status: 'transferable' }]))

      expect(listCareerGrowthRows({ direction: 'fhir' }, db)).toHaveLength(1)
      expect(listCareerGrowthRows({ direction: 'fullstack' }, db)).toEqual([])
    } finally {
      sqlite.close()
    }
  })
})
