import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { candidateFitSchemaVersion } from '../src/ai/schemas/candidate-fit'
import { jobAnalysisSchemaVersion } from '../src/ai/schemas/job-analysis'
import { completeAnalysisRun, createAnalysisRun } from '../src/db/analysis'
import { decideRunSkill } from '../src/db/analysis-decision-service'
import { listRunDecisions } from '../src/db/analysis-decisions'
import { db } from '../src/db/client'
import {
  acceptExtensionBatch,
  extensionBatchStatus,
  prepareExtensionItem,
  updateExtensionItem,
} from '../src/db/extension-intake'
import { completeJobAnalysisRun, createJobAnalysisRun } from '../src/db/job-analysis-runs'
import { jobApplications, jobIntakeItems, jobPostingAnalyses } from '../src/db/schema'
import { insertSkill, listRunSkillReviews } from '../src/db/skill-queries'
import { mergeSkills } from '../src/db/skill-service'
import {
  buildCandidateAnalysisInput,
  getCandidateAnalysisState,
} from '../src/lib/candidate/analysis'
import { buildJobAnalysisInput } from '../src/lib/job-analysis/input'
import { intakeApiAuth, isIntakeApiPath } from '../src/lib/job-intake/api-auth'
import { captureEnvelopeSchema, captureItemSchema } from '../src/lib/job-intake/contracts'
import { advanceExtensionItem, type IntakeDispatchers } from '../src/lib/job-intake/extension-queue'
import { sourceIdentities } from '../src/lib/job-intake/identity'
import { adoptAiFacts, captureProvenance, userProvenance } from '../src/lib/job-intake/provenance'
import { careerTestDatabase } from './support/career-db'

const item = (sourceUrl = `https://jobs.example.com/${crypto.randomUUID()}`) => ({
  clientItemId: crypto.randomUUID(),
  sourceUrl,
  rawText: 'Build reliable web applications with TypeScript.',
  suggestedMetadata: { jobTitle: 'Engineer', companyName: 'Example Company' },
})
const envelope = (items: unknown[]) => ({
  schemaVersion: 1,
  clientBatchId: crypto.randomUUID(),
  items,
})

describe('extension intake contract and identity', () => {
  test('requires URLs, real dates, distinct item IDs, and rejects forged fields', () => {
    expect(captureItemSchema.safeParse({ ...item(), sourceUrl: '' }).success).toBe(false)
    expect(captureItemSchema.safeParse({ ...item(), status: 'Applied' }).success).toBe(false)
    expect(
      captureItemSchema.safeParse({ ...item(), suggestedMetadata: { postedDate: '2026-02-30' } })
        .success,
    ).toBe(false)
    const same = item()
    expect(captureEnvelopeSchema.safeParse(envelope([same, same])).success).toBe(false)
  })
  test('preserves required query and hash route; detects provider URL variants', () => {
    const policy = {
      version: 1 as const,
      queryMode: 'keep-listed' as const,
      queryParams: ['jobId'],
      dropQueryParams: ['utm_source'],
      fragmentMode: 'keep' as const,
    }
    expect(
      sourceIdentities({
        sourceUrl: 'https://example.com/job?jobId=1&utm_source=x#/role/1',
        identity: { policy },
      }),
    ).toContain('url:https://example.com/job?jobId=1#/role/1')
    expect(
      sourceIdentities({ sourceUrl: 'https://www.linkedin.com/jobs/view/123/?trackingId=x' }),
    ).toContain('provider:linkedin.com:123')
    expect(
      sourceIdentities({ sourceUrl: 'https://www.linkedin.com/jobs/search/?currentJobId=123' }),
    ).toContain('provider:linkedin.com:123')
  })
  test('capture wins over AI, explicit clears and legacy values stay protected', () => {
    const captured = captureProvenance({ jobTitle: 'Page title' })
    const result = adoptAiFacts(captured, { jobTitle: 'AI title', location: 'Remote' })
    expect(result.updates).toEqual({ location: 'Remote' })
    expect(
      adoptAiFacts(userProvenance({ location: null }, result.json), { location: 'Toronto' })
        .updates,
    ).toEqual({})
    expect(adoptAiFacts(null, { jobTitle: 'Replacement' }).updates).toEqual({})
  })
})

describe('extension API persistence', () => {
  test('preserves 500-character compensation text from capture through application storage', () => {
    const salary = `${'Compensation includes salary, bonus, and benefits. '.repeat(11).slice(0, 499)}.`
    const payload = { ...item(), suggestedMetadata: { salary } }
    expect(captureItemSchema.parse(payload).suggestedMetadata?.salary).toBe(salary)
    expect(
      captureItemSchema.safeParse({ ...payload, suggestedMetadata: { salary: 'x'.repeat(501) } })
        .success,
    ).toBe(false)
    const accepted = acceptExtensionBatch(envelope([payload]), crypto.randomUUID())
    const captured = extensionBatchStatus(accepted.batchId)!.items[0]
    const prepared = prepareExtensionItem(captured.itemId)
    expect(
      db
        .select()
        .from(jobApplications)
        .where(eq(jobApplications.id, prepared.jobApplicationId!))
        .get()?.salary,
    ).toBe(salary)
  })
  test('replays identical submissions, isolates rejected items and rejects conflicting retries', () => {
    const data = envelope([item(), { ...item(), rawText: '' }])
    const key = crypto.randomUUID()
    const accepted = acceptExtensionBatch(data, key)
    expect(acceptExtensionBatch(data, key).batchId).toBe(accepted.batchId)
    expect(acceptExtensionBatch(data, key).replayed).toBe(true)
    expect(extensionBatchStatus(accepted.batchId)?.counts.rejected).toBe(1)
    expect(() => acceptExtensionBatch({ ...data, items: [item()] }, key)).toThrow('already used')
  })
  test('reimport updates the posting version without duplicating or changing application facts', () => {
    const fixture = careerTestDatabase()
    try {
      const first = item()
      const a = acceptExtensionBatch(envelope([first]), crypto.randomUUID())
      const firstItem = extensionBatchStatus(a.batchId)!.items[0]
      const prepared = prepareExtensionItem(firstItem.itemId)
      expect(
        db
          .select()
          .from(jobApplications)
          .where(eq(jobApplications.id, prepared.jobApplicationId!))
          .get()?.postedDate,
      ).toBeNull()
      const b = acceptExtensionBatch(
        envelope([
          {
            ...first,
            clientItemId: crypto.randomUUID(),
            rawText: 'Changed description',
            identity: {
              policy: {
                version: 1,
                queryMode: 'keep-all',
                queryParams: [],
                dropQueryParams: [],
                fragmentMode: 'drop',
              },
            },
          },
        ]),
        crypto.randomUUID(),
      )
      const duplicate = prepareExtensionItem(extensionBatchStatus(b.batchId)!.items[0].itemId)
      expect(duplicate.pipelineStatus).toBe('processing')
      expect(duplicate.jobApplicationId).toBe(prepared.jobApplicationId)
      expect(duplicate.jobPostingId).not.toBe(prepared.jobPostingId)
      expect(duplicate.jobAnalysisRunId).toBeNull()
      const status = extensionBatchStatus(b.batchId)!
      expect(status.isTerminal).toBe(false)
      expect(extensionBatchStatus(b.batchId)?.terminalRevision).toBe(status.terminalRevision)
    } finally {
      fixture.cleanup()
    }
  })
  test('completed means pipeline completion, not intake ready', () => {
    const a = acceptExtensionBatch(envelope([item()]), crypto.randomUUID())
    const id = extensionBatchStatus(a.batchId)!.items[0].itemId
    db.update(jobIntakeItems).set({ status: 'ready' }).where(eq(jobIntakeItems.id, id)).run()
    expect(extensionBatchStatus(a.batchId)?.isTerminal).toBe(false)
    updateExtensionItem(id, { pipelineStatus: 'completed', stage: 'done' })
    expect(extensionBatchStatus(a.batchId)?.isTerminal).toBe(true)
  })
})

test('intake auth fails closed, returns JSON and does not authorize unrelated routes', async () => {
  const app = new Hono()
  app.use('*', intakeApiAuth({ JOB_INTAKE_API_TOKEN: 'test-only-token' }))
  app.get('/test', (c) => c.json({ ok: true }))
  const denied = await app.request('/test')
  expect(denied.status).toBe(401)
  expect(denied.headers.get('WWW-Authenticate')).toBeNull()
  expect((await denied.json()).error.code).toBe('unauthorized')
  expect(
    (await app.request('/test', { headers: { Authorization: 'Bearer test-only-token' } })).status,
  ).toBe(200)
  expect(isIntakeApiPath('/api/v1/job-intake/batches/12')).toBe(true)
  expect(isIntakeApiPath('/api/v1/job-intake/batches/12/delete')).toBe(false)
})

test('intake reaches candidate completion with pending catalog skills and survives same-skill merge without AI rerun', async () => {
  const fixture = careerTestDatabase()
  try {
    const captured = item()
    const accepted = acceptExtensionBatch(envelope([captured]), crypto.randomUUID())
    const id = extensionBatchStatus(accepted.batchId)!.items[0].itemId
    let calls = 0
    const dispatch: IntakeDispatchers = {
      job: async (postingId, persisted) => {
        calls++
        const built = buildJobAnalysisInput(db, postingId)!
        const run = createJobAnalysisRun(db, {
          jobPostingId: postingId,
          inputHash: built.inputHash,
          frozenInputJson: JSON.stringify(built.snapshot),
          model: 'test',
          promptVersion: 'test',
          schemaVersion: jobAnalysisSchemaVersion,
        })
        persisted(run)
        completeJobAnalysisRun(db, run.id, {
          jobTitle: 'An AI suggestion',
          location: 'Remote',
          postedDate: null,
          salary: null,
          direction: 'fullstack',
          parserModel: 'test',
          parserPromptVersion: 'test',
          analysisPromptVersion: 'test',
          analysis: {
            summary: { rolePurpose: 'Build products.', idealCandidate: 'A software engineer.' },
            classification: {
              roleType: 'fullstack',
              advertisedSeniority: 'senior',
              practicalSeniority: 'senior',
              rationale: 'Own feature delivery.',
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
                type: 'skill',
                importance: 'required',
                basis: 'explicit',
                statement: 'Use an example message broker.',
                sourceText: 'Use an example message broker.',
                inferenceRationale: null,
                terms: [{ term: `Broker ${id}` }],
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
        })
      },
      candidate: async (applicationId, persisted) => {
        calls++
        const built = buildCandidateAnalysisInput(applicationId)!
        const run = createAnalysisRun({
          jobPostingAnalysisId: built.snapshot.jobAnalysis.runId,
          inputHash: built.inputHash,
          inputSnapshotJson: JSON.stringify(built.snapshot),
          model: 'test',
          promptVersion: 'test',
          schemaVersion: candidateFitSchemaVersion,
        })
        persisted(run)
        completeAnalysisRun(
          run.id,
          JSON.stringify({
            fitRecommendation: 'apply-selectively',
            recommendationRationale: 'Verify supporting evidence.',
            requirementAssessments: built.snapshot.jobAnalysis.requirements.map((r) => ({
              jobRequirementId: r.id,
              evidenceStatus: 'unknown-evidence',
              evidenceRefs: [],
              explanation: 'No supplied evidence.',
              confidence: 0.9,
            })),
            strengths: [],
            concerns: [],
            interviewPreparation: [],
            careerDataSuggestions: [],
          }),
        )
      },
    }
    await advanceExtensionItem(id, dispatch)
    expect(extensionBatchStatus(accepted.batchId)?.isTerminal).toBe(false)
    await advanceExtensionItem(id, dispatch)
    await advanceExtensionItem(id, dispatch)
    await advanceExtensionItem(id, dispatch)
    const status = extensionBatchStatus(accepted.batchId)!
    expect(status.isTerminal).toBe(true)
    expect(status.counts.completed).toBe(1)
    expect(status.decisionCount).toBe(1)
    expect(calls).toBe(2)
    const row = db.select().from(jobIntakeItems).where(eq(jobIntakeItems.id, id)).get()!
    const application = db
      .select()
      .from(jobApplications)
      .where(eq(jobApplications.id, row.jobApplicationId!))
      .get()!
    expect(application.jobTitle).toBe('Engineer')
    const reviews = listRunSkillReviews(row.candidateAnalysisRunId!)
    expect(reviews[0].reviewStatus).toBe('pending')
    decideRunSkill({
      runId: row.candidateAnalysisRunId!,
      skillId: reviews[0].skillId,
      decision: 'include',
      reason: 'Used this broker in a personal prototype.',
    })
    const prior = listRunDecisions(db, row.candidateAnalysisRunId!)[0]!
    expect(prior.basisHash).toBeTruthy()
    db.update(jobApplications)
      .set({ jobTitle: 'Human title', location: 'Human location', status: 'Applied' })
      .where(eq(jobApplications.id, application.id))
      .run()
    const refreshed = acceptExtensionBatch(
      envelope([{ ...captured, clientItemId: crypto.randomUUID() }]),
      crypto.randomUUID(),
    )
    const refreshId = extensionBatchStatus(refreshed.batchId)!.items[0].itemId
    // Keep title stable in the frozen reuse comparison: metadata edits are not skill evidence.
    await advanceExtensionItem(refreshId, dispatch)
    await advanceExtensionItem(refreshId, dispatch)
    const refreshedStatus = extensionBatchStatus(refreshed.batchId)!
    expect(refreshedStatus.isTerminal).toBe(true)
    expect(calls).toBe(3) // candidate only; no second paid Job Analysis
    const refreshedRow = db
      .select()
      .from(jobIntakeItems)
      .where(eq(jobIntakeItems.id, refreshId))
      .get()!
    expect(refreshedRow.jobApplicationId).toBe(application.id)
    expect(refreshedRow.jobPostingId).toBe(row.jobPostingId)
    expect(refreshedRow.jobAnalysisRunId).toBe(row.jobAnalysisRunId)
    expect(refreshedRow.candidateAnalysisRunId).not.toBe(row.candidateAnalysisRunId)
    const inherited = listRunDecisions(db, refreshedRow.candidateAnalysisRunId!)[0]!
    expect(inherited.decision).toBe('include')
    expect(inherited.reason).toBe(prior.reason)
    expect(inherited.previousDecisionId).toBe(prior.id)
    expect(refreshedStatus.decisionCount).toBe(0)
    expect(
      db.select().from(jobApplications).where(eq(jobApplications.id, application.id)).get(),
    ).toMatchObject({ jobTitle: 'Human title', location: 'Human location', status: 'Applied' })
    const target = insertSkill(db, { name: `Canonical Broker ${id}`, reviewStatus: 'approved' })
    mergeSkills(reviews[0].skillId, target.id)
    expect(getCandidateAnalysisState(application.id).currentCompleted?.id).toBe(
      refreshedRow.candidateAnalysisRunId ?? undefined,
    )
    expect(listRunSkillReviews(row.candidateAnalysisRunId!)[0].skillId).toBe(target.id)
    expect(calls).toBe(3)
  } finally {
    fixture.cleanup()
  }
})

test('a persisted child survives dispatch failure and recovery uses that exact run ID', async () => {
  const fixture = careerTestDatabase()
  try {
    const accepted = acceptExtensionBatch(envelope([item()]), crypto.randomUUID())
    const id = extensionBatchStatus(accepted.batchId)!.items[0].itemId
    let createdRunId = 0
    await advanceExtensionItem(id, {
      job: async (postingId, persisted) => {
        const built = buildJobAnalysisInput(db, postingId)!
        const run = createJobAnalysisRun(db, {
          jobPostingId: postingId,
          inputHash: built.inputHash,
          frozenInputJson: JSON.stringify(built.snapshot),
          model: 'test',
          promptVersion: 'test',
          schemaVersion: jobAnalysisSchemaVersion,
        })
        createdRunId = run.id
        persisted(run)
        throw new Error('Synthetic queue is temporarily unavailable')
      },
      candidate: async () => {
        throw new Error('Candidate must not start yet')
      },
    })
    expect(extensionBatchStatus(accepted.batchId)!.items[0].status).toBe('queued')
    let resumedId: number | undefined
    await advanceExtensionItem(id, {
      job: async (_postingId, _persisted, runId) => {
        resumedId = runId
      },
      candidate: async () => {
        throw new Error('Candidate must not start yet')
      },
    })
    expect(resumedId).toBe(createdRunId)
    expect(extensionBatchStatus(accepted.batchId)!.items[0].jobAnalysisRunId).toBe(createdRunId)
    expect(extensionBatchStatus(accepted.batchId)!.isTerminal).toBe(false)
    const stored = db.select().from(jobIntakeItems).where(eq(jobIntakeItems.id, id)).get()!
    expect(stored.claimedAt).toBeNull()
    db.update(jobPostingAnalyses)
      .set({ status: 'Processing', startedAt: new Date(Date.now() - 16 * 60_000).toISOString() })
      .where(eq(jobPostingAnalyses.id, createdRunId))
      .run()
    await advanceExtensionItem(id, {
      job: async () => {
        throw new Error('Timed-out run must not be redispatched')
      },
      candidate: async () => {
        throw new Error('Candidate must not start')
      },
    })
    expect(extensionBatchStatus(accepted.batchId)!.items[0].error?.code).toBe('analysis-timeout')
    expect(
      db.select().from(jobPostingAnalyses).where(eq(jobPostingAnalyses.id, createdRunId)).get()
        ?.status,
    ).toBe('Failed')
  } finally {
    fixture.cleanup()
  }
})
