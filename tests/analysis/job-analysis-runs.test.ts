import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from '../../src/db/schema'
import { type AnalysisRunSummary, classifyAnalysisRunState } from '../../src/lib/analysis-run-state'
import { migratedDatabase } from '../support/sqlite'

/**
 * Job Analysis run-history contracts.
 *
 * The `run-state classification` suite is active and protects the pure,
 * database-free freshness classifier shared by every rerunnable stage.
 *
 * The `run reuse and append-only history` suite is a conditional contract:
 * it stays pending until `src/db/job-analysis-runs.ts` exists (Step 1.2)
 * and then exercises the temporary-database service boundary.
 */
const jobAnalysisRunsPath = resolve(process.cwd(), 'src/db/job-analysis-runs.ts')
const runServiceTest = existsSync(jobAnalysisRunsPath) ? test : test.todo

function run(overrides: Partial<AnalysisRunSummary> & { id: number }): AnalysisRunSummary {
  return {
    status: 'Completed',
    inputHash: 'input-hash',
    schemaVersion: '3.0.0',
    ...overrides,
  }
}

describe('run-state classification', () => {
  test('reports never-run when no history exists', () => {
    const result = classifyAnalysisRunState([], 'input-hash', '3.0.0')
    expect(result.state).toBe('never-run')
    expect(result.latest).toBeNull()
    expect(result.currentCompleted).toBeNull()
    expect(result.staleCompleted).toBeNull()
  })

  test('classifies a completed run matching current inputs as current', () => {
    const result = classifyAnalysisRunState([run({ id: 1 })], 'input-hash', '3.0.0')
    expect(result.state).toBe('current')
    expect(result.currentCompleted?.id).toBe(1)
    expect(result.staleCompleted).toBeNull()
  })

  test('classifies a completed run with changed inputs as stale', () => {
    const result = classifyAnalysisRunState([run({ id: 1 })], 'other-hash', '3.0.0')
    expect(result.state).toBe('stale')
    expect(result.currentCompleted).toBeNull()
    expect(result.staleCompleted?.id).toBe(1)
  })

  test('classifies a null-schema completed run as legacy, never as current', () => {
    const result = classifyAnalysisRunState(
      [run({ id: 1, schemaVersion: null })],
      'input-hash',
      '3.0.0',
    )
    expect(result.state).toBe('legacy')
    expect(result.currentCompleted).toBeNull()
    expect(result.staleCompleted).toBeNull()
  })

  test('keeps a failed latest attempt separate from an older usable result', () => {
    const result = classifyAnalysisRunState(
      [
        run({ id: 2, status: 'Failed', inputHash: 'new-hash' }),
        run({ id: 1, inputHash: 'input-hash' }),
      ],
      'input-hash',
      '3.0.0',
    )
    expect(result.state).toBe('failed')
    expect(result.latest?.id).toBe(2)
    expect(result.currentCompleted?.id).toBe(1)
  })

  test('surfaces queued and processing latest attempts without hiding completed history', () => {
    for (const status of ['Queued', 'Processing'] as const) {
      const result = classifyAnalysisRunState(
        [run({ id: 2, status }), run({ id: 1 })],
        'input-hash',
        '3.0.0',
      )
      expect(result.state).toBe(status === 'Queued' ? 'queued' : 'processing')
      expect(result.latest?.id).toBe(2)
      expect(result.latestCompleted?.id).toBe(1)
    }
  })

  test('requires both a matching hash and a supported schema to be current', () => {
    const mismatchSchema = classifyAnalysisRunState(
      [run({ id: 1, schemaVersion: '2.0.0' })],
      'input-hash',
      '3.0.0',
    )
    expect(mismatchSchema.state).toBe('stale')
    expect(mismatchSchema.currentCompleted).toBeNull()
  })

  test('is deterministic regardless of the input run order', () => {
    const a = classifyAnalysisRunState([run({ id: 1 }), run({ id: 2 })], 'input-hash', '3.0.0')
    const b = classifyAnalysisRunState([run({ id: 2 }), run({ id: 1 })], 'input-hash', '3.0.0')
    expect(a.latest?.id).toBe(2)
    expect(b.latest?.id).toBe(2)
    expect(a.state).toBe(b.state)
  })
})

describe('job analysis run reuse and append-only history', () => {
  runServiceTest('reuses an identical in-flight run instead of duplicating it', async () => {
    const sqlite = migratedDatabase()
    try {
      const db = drizzle({ client: sqlite, schema })
      const { applicationId } = seedPosting(sqlite)
      const { createJobAnalysisRun, findReusableJobAnalysisRun } = await import(jobAnalysisRunsPath)
      const created = createJobAnalysisRun(db, {
        jobPostingId: applicationId,
        inputHash: 'input-hash',
        frozenInputJson: '{}',
        model: 'gpt-test',
        promptVersion: '3.0.0',
        schemaVersion: '3.0.0',
      })
      expect(findReusableJobAnalysisRun(db, applicationId, 'input-hash')?.id).toBe(created.id)
      expect(findReusableJobAnalysisRun(db, applicationId, 'other-hash')).toBeNull()
    } finally {
      sqlite.close()
    }
  })

  runServiceTest('creates a new run for an explicit rerun after completion', async () => {
    const sqlite = migratedDatabase()
    try {
      const db = drizzle({ client: sqlite, schema })
      const { applicationId } = seedPosting(sqlite)
      const { completeJobAnalysisRun, createJobAnalysisRun, findReusableJobAnalysisRun } =
        await import(jobAnalysisRunsPath)
      const first = createJobAnalysisRun(db, {
        jobPostingId: applicationId,
        inputHash: 'input-hash',
        frozenInputJson: '{}',
        model: 'gpt-test',
        promptVersion: '3.0.0',
        schemaVersion: '3.0.0',
      })
      completeJobAnalysisRun(db, first.id, minimalParsedResult())
      expect(findReusableJobAnalysisRun(db, applicationId, 'input-hash')).toBeNull()
      const second = createJobAnalysisRun(db, {
        jobPostingId: applicationId,
        inputHash: 'input-hash',
        frozenInputJson: '{}',
        model: 'gpt-test',
        promptVersion: '3.0.0',
        schemaVersion: '3.0.0',
      })
      expect(second.id).not.toBe(first.id)
    } finally {
      sqlite.close()
    }
  })
})

describe('job analysis run-state queries', () => {
  runServiceTest('returns latest, current, stale, and legacy results separately', async () => {
    const sqlite = migratedDatabase()
    try {
      const db = drizzle({ client: sqlite, schema })
      const { applicationId } = seedPosting(sqlite)
      const { getJobAnalysisState } = await import(jobAnalysisRunsPath)

      const legacy = db
        .insert(schema.jobPostingAnalyses)
        .values({
          jobPostingId: applicationId,
          status: 'Completed',
          schemaVersion: null,
          generatedAt: '2026-08-01',
          createdAt: '2026-08-01',
          updatedAt: '2026-08-01',
          completedAt: '2026-08-01',
        })
        .returning()
        .get()

      expect(getJobAnalysisState(db, applicationId, 'current-hash').state).toBe('legacy')
      expect(getJobAnalysisState(db, applicationId, 'current-hash').currentCompleted).toBeNull()
      expect(getJobAnalysisState(db, applicationId, 'current-hash').latestCompleted?.id).toBe(
        legacy.id,
      )

      const current = db
        .insert(schema.jobPostingAnalyses)
        .values({
          jobPostingId: applicationId,
          status: 'Completed',
          inputHash: 'current-hash',
          schemaVersion: '3.0.0',
          generatedAt: '2026-08-02',
          createdAt: '2026-08-02',
          updatedAt: '2026-08-02',
          completedAt: '2026-08-02',
        })
        .returning()
        .get()

      const currentState = getJobAnalysisState(db, applicationId, 'current-hash')
      expect(currentState.state).toBe('current')
      expect(currentState.currentCompleted?.id).toBe(current.id)

      const staleState = getJobAnalysisState(db, applicationId, 'changed-hash')
      expect(staleState.state).toBe('stale')
      expect(staleState.currentCompleted).toBeNull()
      expect(staleState.staleCompleted?.id).toBe(current.id)

      db.insert(schema.jobPostingAnalyses)
        .values({
          jobPostingId: applicationId,
          status: 'Failed',
          inputHash: 'current-hash',
          schemaVersion: '3.0.0',
          errorMessage: 'boom',
          generatedAt: '2026-08-03',
          createdAt: '2026-08-03',
          updatedAt: '2026-08-03',
        })
        .run()

      const failedState = getJobAnalysisState(db, applicationId, 'current-hash')
      expect(failedState.state).toBe('failed')
      expect(failedState.currentCompleted?.id).toBe(current.id)
    } finally {
      sqlite.close()
    }
  })
})

describe('job analysis completion transaction', () => {
  runServiceTest(
    'writes result fields, normalized requirements, and skill reconciliation together',
    async () => {
      const sqlite = migratedDatabase()
      try {
        const db = drizzle({ client: sqlite, schema })
        const { applicationId } = seedPosting(sqlite)
        const { completeJobAnalysisRun, createJobAnalysisRun } = await import(jobAnalysisRunsPath)
        const run = createJobAnalysisRun(db, {
          jobPostingId: applicationId,
          inputHash: 'input-hash',
          frozenInputJson: '{}',
          model: 'gpt-test',
          promptVersion: '2.2.0',
          schemaVersion: '3.0.0',
        })

        completeJobAnalysisRun(db, run.id, minimalParsedResult())

        const completed = db
          .select()
          .from(schema.jobPostingAnalyses)
          .where(eq(schema.jobPostingAnalyses.id, run.id))
          .get()
        expect(completed?.status).toBe('Completed')
        expect(completed?.schemaVersion).toBe('3.0.0')
        expect(completed?.completedAt).toBeTruthy()
        expect(completed?.summary).toContain('Build software.')

        const requirements = db
          .select()
          .from(schema.jobRequirements)
          .where(eq(schema.jobRequirements.jobPostingAnalysisId, run.id))
          .all()
        expect(requirements).toHaveLength(1)
        expect(requirements[0].statement).toBe('Senior engineering experience.')
        expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
      } finally {
        sqlite.close()
      }
    },
  )
})

function seedPosting(sqlite: ReturnType<typeof migratedDatabase>) {
  const { applicationId } = seedApplicationHelper(sqlite)
  const posting = sqlite
    .query(
      `INSERT INTO job_postings (job_application_id, raw_text, captured_at, content_hash)
       VALUES (?, ?, ?, ?) RETURNING id`,
    )
    .get(applicationId, 'Senior Engineer role', '2026-08-28', 'posting-hash') as { id: number }
  return { applicationId: posting.id }
}

function minimalParsedResult() {
  return {
    jobTitle: 'Senior Engineer',
    location: null,
    postedDate: null,
    salary: null,
    skills: [],
    requirements: ['Senior engineering experience'],
    responsibilities: [],
    painPoints: [],
    culture: [],
    redFlags: [],
    successMetrics: [],
    benefits: [],
    notes: null,
    analysis: {
      summary: { rolePurpose: 'Build software.', idealCandidate: 'An experienced engineer.' },
      classification: {
        roleType: 'fullstack',
        advertisedSeniority: 'senior',
        practicalSeniority: 'senior',
        rationale: 'Ownership across the stack.',
        functionalEmphasis: {
          frontend: 20,
          backend: 20,
          testingQuality: 20,
          devopsInfrastructure: 20,
          collaborationOwnership: 20,
        },
      },
      requirements: [
        {
          type: 'experience',
          importance: 'required',
          basis: 'explicit',
          statement: 'Senior engineering experience.',
          sourceText: 'Senior engineering experience.',
          inferenceRationale: null,
        },
      ],
      interviewQuestions: [],
    },
    parserModel: 'gpt-test',
    parserPromptVersion: '2.2.0',
    analysisPromptVersion: '3.0.0',
  }
}

function seedApplicationHelper(sqlite: ReturnType<typeof migratedDatabase>) {
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
      'Senior Engineer',
      'fullstack',
      '2026-08-28',
      'B',
      'Saved',
      '2026-08-28',
      '2026-08-28',
    ) as { id: number }
  return { applicationId: application.id }
}
