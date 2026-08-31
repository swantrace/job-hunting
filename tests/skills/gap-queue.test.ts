import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { listCareerDataGaps } from '../../src/db/gap-queue'
import * as schema from '../../src/db/schema'
import { migratedDatabase } from '../support/sqlite'

const exampleCareerData = resolve(process.cwd(), 'career-data.example')
const exampleProfiles = resolve(process.cwd(), 'profiles.example')

function withExampleCareerData<T>(fn: () => T): T {
  const previousData = process.env.CAREER_DATA_DIR
  const previousProfiles = process.env.CAREER_PROFILES_DIR
  process.env.CAREER_DATA_DIR = exampleCareerData
  process.env.CAREER_PROFILES_DIR = exampleProfiles
  try {
    return fn()
  } finally {
    if (previousData === undefined) delete process.env.CAREER_DATA_DIR
    else process.env.CAREER_DATA_DIR = previousData
    if (previousProfiles === undefined) delete process.env.CAREER_PROFILES_DIR
    else process.env.CAREER_PROFILES_DIR = previousProfiles
  }
}

type Assessment = { jobRequirementId: number; evidenceStatus: 'direct' | 'unknown-evidence' }

function resultJson(assessments: Assessment[]) {
  return JSON.stringify({
    fitRecommendation: 'apply',
    recommendationRationale: 'Synthetic review.',
    profileRecommendation: {
      recommendedProfileId: 'fullstack',
      rationale: 'Synthetic.',
      alternatives: [],
    },
    requirementAssessments: assessments.map((assessment) => ({
      jobRequirementId: assessment.jobRequirementId,
      evidenceStatus: assessment.evidenceStatus,
      evidenceRefs:
        assessment.evidenceStatus === 'direct'
          ? [{ sourceType: 'skill', sourceId: 'typescript', relevance: 'direct' }]
          : [],
      explanation: 'Synthetic explanation.',
      confidence: 0.8,
    })),
    strengths: [],
    concerns: [],
    interviewPreparation: [],
    careerDataSuggestions: [],
  })
}

function id(value: unknown) {
  return (value as { id: number }).id
}

/**
 * Seeds one application with one completed candidate run whose result contains
 * one requirement assessment, and maps that requirement to one canonical skill.
 */
function seedGapApplication(
  sqlite: Database,
  options: {
    company: string
    jobTitle: string
    skillKey: string
    skillName: string
    category?: string | null
    categoryLabel?: string
    requirementStatement: string
    evidenceStatus: 'direct' | 'unknown-evidence'
    decision?: 'pending' | 'include' | 'skip'
    reason?: string | null
    runSequence?: number
    skillId?: number
  },
) {
  const date = '2026-01-01'
  if (options.category && options.categoryLabel) {
    sqlite
      .query(
        `INSERT OR IGNORE INTO skill_categories (key, label, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(options.category, options.categoryLabel, 1, date, date)
  }
  const companyId = id(
    sqlite
      .query('INSERT INTO companies (name, created_at, updated_at) VALUES (?, ?, ?) RETURNING id')
      .get(options.company, date, date),
  )
  const applicationId = id(
    sqlite
      .query(
        `INSERT INTO job_applications (
           company_id, job_title, direction, posted_date, priority, status, created_at, updated_at
         ) VALUES (?, ?, 'fullstack', ?, 'B', 'Saved', ?, ?) RETURNING id`,
      )
      .get(companyId, options.jobTitle, date, date, date),
  )
  const skillId =
    options.skillId ??
    id(
      sqlite
        .query(
          `INSERT INTO skills (key, name, category, review_status, origin, created_at, updated_at)
           VALUES (?, ?, ?, 'pending', 'job-parser', ?, ?) RETURNING id`,
        )
        .get(options.skillKey, options.skillName, options.category ?? null, date, date),
    )
  const postingId = id(
    sqlite
      .query(
        `INSERT INTO job_postings (job_application_id, raw_text, captured_at, content_hash)
         VALUES (?, ?, ?, ?) RETURNING id`,
      )
      .get(applicationId, 'Role.', date, `hash-${options.skillKey}-${options.runSequence ?? 0}`),
  )
  const analysisId = id(
    sqlite
      .query(
        `INSERT INTO job_posting_analyses (job_posting_id, status, created_at, updated_at, completed_at)
         VALUES (?, 'Completed', ?, ?, ?) RETURNING id`,
      )
      .get(postingId, date, date, date),
  )
  const requirementId = id(
    sqlite
      .query(
        `INSERT INTO job_requirements (
           job_posting_analysis_id, sequence, requirement_type, importance, basis, statement, source_text, created_at, updated_at
         ) VALUES (?, 1, 'skill', 'required', 'explicit', ?, ?, ?, ?) RETURNING id`,
      )
      .get(analysisId, options.requirementStatement, options.requirementStatement, date, date),
  )
  sqlite
    .query(
      `INSERT INTO job_requirements_to_skills (job_requirement_id, skill_id, raw_label, confidence)
       VALUES (?, ?, ?, 0.9)`,
    )
    .run(requirementId, skillId, options.skillName)
  const runId = id(
    sqlite
      .query(
        `INSERT INTO application_analysis_runs (
           job_posting_analysis_id, status, queue_job_id, result_json, created_at, updated_at, completed_at
         ) VALUES (?, 'Completed', ?, ?, ?, ?, ?) RETURNING id`,
      )
      .get(
        analysisId,
        `analysis-${options.skillKey}-${options.runSequence ?? 0}`,
        resultJson([{ jobRequirementId: requirementId, evidenceStatus: options.evidenceStatus }]),
        date,
        date,
        date,
      ),
  )
  if (options.decision) {
    sqlite
      .query(
        `INSERT INTO analysis_run_decisions (application_analysis_run_id, skill_id, decision, reason, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(runId, skillId, options.decision, options.reason ?? null, date, date)
  }
  return { companyId, applicationId, skillId, requirementId, runId, analysisId }
}

function seedCandidateRun(
  sqlite: Database,
  options: {
    analysisId: number
    skillId: number
    requirementId: number
    evidenceStatus: 'direct' | 'unknown-evidence'
    decision?: 'pending' | 'include' | 'skip'
    reason?: string | null
    runSequence: number
  },
) {
  const date = '2026-01-01'
  const runId = id(
    sqlite
      .query(
        `INSERT INTO application_analysis_runs (
           job_posting_analysis_id, status, queue_job_id, result_json, created_at, updated_at, completed_at
         ) VALUES (?, 'Completed', ?, ?, ?, ?, ?) RETURNING id`,
      )
      .get(
        options.analysisId,
        `analysis-${options.runSequence}`,
        resultJson([
          { jobRequirementId: options.requirementId, evidenceStatus: options.evidenceStatus },
        ]),
        date,
        date,
        date,
      ),
  )
  if (options.decision) {
    sqlite
      .query(
        `INSERT INTO analysis_run_decisions (application_analysis_run_id, skill_id, decision, reason, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(runId, options.skillId, options.decision, options.reason ?? null, date, date)
  }
  return runId
}

describe('career data gap queue derivation', () => {
  test('derives deduplicated gaps with source context without writing career data', () => {
    const sqlite = migratedDatabase()
    try {
      withExampleCareerData(() => {
        seedGapApplication(sqlite, {
          company: 'Acme',
          jobTitle: 'Backend Engineer',
          skillKey: 'kafka-test',
          skillName: 'Kafka',
          category: 'messaging-async',
          categoryLabel: 'Messaging & Async',
          requirementStatement: 'Experience with Kafka event streaming',
          evidenceStatus: 'unknown-evidence',
          decision: 'include',
          reason: 'Used Kafka in a personal prototype.',
        })

        const gaps = listCareerDataGaps({}, drizzle({ client: sqlite, schema }))

        expect(gaps).toHaveLength(1)
        expect(gaps[0].skillKey).toBe('kafka-test')
        expect(gaps[0].applicationCount).toBe(1)
        expect(gaps[0].requirementStatements).toEqual(['Experience with Kafka event streaming'])
        expect(gaps[0].latestDecision).toBe('include')
        expect(gaps[0].latestIncludeReason).toBe('Used Kafka in a personal prototype.')
        expect(gaps[0].latestApplicationTitle).toBe('Backend Engineer')
        expect(gaps[0].latestCompany).toBe('Acme')
        expect(gaps[0].sources[0].applicationId).toBeGreaterThan(0)
        expect(gaps[0].nowEvidenced).toBe(false)
      })
    } finally {
      sqlite.close()
    }
  })

  test('groups multiple requirements and applications pointing to one skill once', () => {
    const sqlite = migratedDatabase()
    try {
      withExampleCareerData(() => {
        const first = seedGapApplication(sqlite, {
          company: 'Acme',
          jobTitle: 'Backend Engineer',
          skillKey: 'kafka-test',
          skillName: 'Kafka',
          requirementStatement: 'Experience with Kafka',
          evidenceStatus: 'unknown-evidence',
        })
        seedGapApplication(sqlite, {
          company: 'Beta',
          jobTitle: 'Streaming Engineer',
          skillKey: 'kafka-test',
          skillName: 'Kafka',
          skillId: first.skillId,
          requirementStatement: 'Build event-driven systems with Kafka',
          evidenceStatus: 'unknown-evidence',
          runSequence: 2,
        })

        const gaps = listCareerDataGaps({}, drizzle({ client: sqlite, schema }))

        expect(gaps).toHaveLength(1)
        expect(gaps[0].applicationCount).toBe(2)
        expect(gaps[0].requirementStatements).toEqual([
          'Build event-driven systems with Kafka',
          'Experience with Kafka',
        ])
        expect(gaps[0].latestApplicationTitle).toBe('Streaming Engineer')
      })
    } finally {
      sqlite.close()
    }
  })

  test('keeps distinct skills with the same display label as separate rows', () => {
    const sqlite = migratedDatabase()
    try {
      withExampleCareerData(() => {
        seedGapApplication(sqlite, {
          company: 'Acme',
          jobTitle: 'Engineer',
          skillKey: 'python-lang',
          skillName: 'Python',
          requirementStatement: 'Python scripting',
          evidenceStatus: 'unknown-evidence',
        })
        seedGapApplication(sqlite, {
          company: 'Beta',
          jobTitle: 'Engineer',
          skillKey: 'python-framework',
          skillName: 'Python',
          requirementStatement: 'Python web frameworks',
          evidenceStatus: 'unknown-evidence',
          runSequence: 2,
        })

        const gaps = listCareerDataGaps({}, drizzle({ client: sqlite, schema }))

        expect(gaps.map((gap) => gap.skillKey).sort()).toEqual(['python-framework', 'python-lang'])
      })
    } finally {
      sqlite.close()
    }
  })

  test('a later direct assessment resolves the gap instead of keeping it open', () => {
    const sqlite = migratedDatabase()
    try {
      withExampleCareerData(() => {
        const seeded = seedGapApplication(sqlite, {
          company: 'Acme',
          jobTitle: 'Engineer',
          skillKey: 'kafka-test',
          skillName: 'Kafka',
          requirementStatement: 'Experience with Kafka',
          evidenceStatus: 'unknown-evidence',
        })
        // A later completed run for the same application shows direct evidence.
        seedCandidateRun(sqlite, {
          analysisId: seeded.analysisId,
          skillId: seeded.skillId,
          requirementId: seeded.requirementId,
          evidenceStatus: 'direct',
          runSequence: 2,
        })

        const gaps = listCareerDataGaps({}, drizzle({ client: sqlite, schema }))

        expect(gaps).toEqual([])
      })
    } finally {
      sqlite.close()
    }
  })

  test('applies category and decision filters', () => {
    const sqlite = migratedDatabase()
    try {
      withExampleCareerData(() => {
        seedGapApplication(sqlite, {
          company: 'Acme',
          jobTitle: 'Engineer',
          skillKey: 'kafka-test',
          skillName: 'Kafka',
          category: 'messaging-async',
          categoryLabel: 'Messaging & Async',
          requirementStatement: 'Kafka experience',
          evidenceStatus: 'unknown-evidence',
          decision: 'include',
          reason: 'Prototype.',
        })
        seedGapApplication(sqlite, {
          company: 'Beta',
          jobTitle: 'Engineer',
          skillKey: 'graphql-test',
          skillName: 'GraphQL',
          category: 'backend-apis',
          categoryLabel: 'Backend & APIs',
          requirementStatement: 'GraphQL experience',
          evidenceStatus: 'unknown-evidence',
          runSequence: 2,
        })

        const db = drizzle({ client: sqlite, schema })
        expect(
          listCareerDataGaps({ category: 'backend-apis', decision: '' }, db).map(
            (gap) => gap.skillKey,
          ),
        ).toEqual(['graphql-test'])
        expect(
          listCareerDataGaps({ category: '', decision: 'include' }, db).map((gap) => gap.skillKey),
        ).toEqual(['kafka-test'])
      })
    } finally {
      sqlite.close()
    }
  })

  test('returns an accessible empty result when there are no gaps', () => {
    const sqlite = migratedDatabase()
    try {
      withExampleCareerData(() => {
        expect(listCareerDataGaps({}, drizzle({ client: sqlite, schema }))).toEqual([])
      })
    } finally {
      sqlite.close()
    }
  })
})

describe('career data gap queue query efficiency', () => {
  test('executes a bounded number of statements regardless of gap count', () => {
    const sqlite = migratedDatabase()
    try {
      withExampleCareerData(() => {
        for (let index = 0; index < 6; index += 1) {
          seedGapApplication(sqlite, {
            company: `Company ${index}`,
            jobTitle: 'Engineer',
            skillKey: `skill-${index}`,
            skillName: `Skill ${index}`,
            requirementStatement: `Requirement ${index}`,
            evidenceStatus: 'unknown-evidence',
            runSequence: index,
          })
        }
        const db = drizzle({ client: sqlite, schema })
        // Warm up so the first-call count is not measuring module init.
        listCareerDataGaps({}, db)

        const counting = countingDatabase(sqlite)
        const countedDb = drizzle({ client: counting.proxy as unknown as Database, schema })
        listCareerDataGaps({}, countedDb)

        // runs + mappings + decisions + aliases = four bulk selects.
        expect(counting.count()).toBeLessThanOrEqual(4)
      })
    } finally {
      sqlite.close()
    }
  })
})

function countingDatabase(sqlite: Database) {
  let count = 0
  const proxy = new Proxy(sqlite, {
    get(target, property, receiver) {
      if (property === 'prepare') {
        return (...args: unknown[]) => {
          count += 1
          return target.prepare(...(args as [string]))
        }
      }
      const value = Reflect.get(target, property, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  return { proxy, count: () => count }
}
