import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { candidateFitSchemaVersion } from '../../src/ai/schemas/candidate-fit'
import { jobAnalysisSchemaVersion } from '../../src/ai/schemas/job-analysis'
import { completeAnalysisRun, createAnalysisRun } from '../../src/db/analysis'
import { listCareerAchievements, updateCareerAchievement } from '../../src/db/career-records'
import { careerContentProbe } from '../../src/db/career-shared'
import { db } from '../../src/db/client'
import { companies, jobApplications, jobPostingAnalyses, jobPostings } from '../../src/db/schema'
import {
  assessApplicationReadiness,
  careerOnboardingGuidance,
  careerOnboardingRequired,
} from '../../src/lib/application-readiness'
import {
  buildCandidateAnalysisInput,
  candidateStalenessReasons,
  currentCandidateAnalysisHash,
} from '../../src/lib/candidate-analysis'
import {
  careerEvidenceIds,
  loadCareerData,
  loadCareerDataFromDatabase,
} from '../../src/lib/career-data'
import { nowISO, todayISO } from '../../src/lib/date'
import { listDirections } from '../../src/lib/directions'
import { generateApplicationDrafts } from '../../src/lib/document-draft-generation'
import {
  buildGenerationInput,
  frozenDraftSnapshotFromRun,
  generationStalenessReasons,
} from '../../src/lib/generation-input'
import { enqueueGeneration } from '../../src/lib/generation-queue'
import { currentJobAnalysisHash } from '../../src/lib/job-analysis-input'
import { syncSkillTaxonomy } from '../../src/lib/skills/sync-taxonomy'
import { writeSyntheticCareerData } from '../career/fixtures'
import {
  type CareerTestDatabase,
  careerTestDatabase,
  createCareerTestDatabase,
} from '../support/career-db'

/**
 * acceptance: SQLite is the sole runtime authority for career facts,
 * directions, categories, personal skills and Base Resume versions.
 *
 * Every database is the isolated `DB_FILE_NAME` database (or a temporary one
 * outside the repository). No test reads the owner's private `career-data/`.
 */

let database: CareerTestDatabase
let applicationId = 0
let candidateRunId = 0
let careerDataDirectoryBefore = ''

beforeAll(() => {
  database = careerTestDatabase()
  // Runtime reads must not depend on any career-data directory at all.
  careerDataDirectoryBefore = process.env.CAREER_DATA_DIR ?? ''
  process.env.CAREER_DATA_DIR = resolve(tmpdir(), `missing-career-data-${crypto.randomUUID()}`)

  const now = nowISO()
  const company = db
    .insert(companies)
    .values({ name: 'Runtime Synthetic Co', createdAt: now, updatedAt: now })
    .returning()
    .get()
  const application = db
    .insert(jobApplications)
    .values({
      companyId: company.id,
      jobTitle: 'Full-Stack Developer',
      direction: 'fullstack',
      postedDate: todayISO(),
      priority: 'B',
      status: 'Saved',
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get()
  applicationId = application.id
  const posting = db
    .insert(jobPostings)
    .values({
      jobApplicationId: application.id,
      version: 1,
      rawText: 'Build TypeScript products with FHIR.',
      capturedAt: now,
      contentHash: 'runtime-posting-hash',
    })
    .returning()
    .get()
  const analysis = db
    .insert(jobPostingAnalyses)
    .values({
      jobPostingId: posting.id,
      status: 'Completed',
      inputHash: currentJobAnalysisHash(db, posting.id),
      frozenInputJson: '{}',
      resultJson: '{}',
      model: 'gpt-test',
      promptVersion: '4.0.0',
      schemaVersion: jobAnalysisSchemaVersion,
      createdAt: now,
      updatedAt: now,
      completedAt: now,
    })
    .returning()
    .get()

  const built = buildCandidateAnalysisInput(applicationId)
  if (!built) throw new Error('Candidate analysis input did not build for the runtime fixture.')
  const run = createAnalysisRun({
    jobPostingAnalysisId: analysis.id,
    inputHash: built.inputHash,
    inputSnapshotJson: JSON.stringify(built.snapshot),
    model: 'gpt-test',
    promptVersion: 'test',
    schemaVersion: candidateFitSchemaVersion,
  })
  completeAnalysisRun(run.id, JSON.stringify({}))
  candidateRunId = run.id
})

afterAll(() => {
  if (careerDataDirectoryBefore === '') delete process.env.CAREER_DATA_DIR
  else process.env.CAREER_DATA_DIR = careerDataDirectoryBefore
  database.cleanup()
})

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
  delete process.env.OPENAI_API_KEY
})

function achievementInput(
  record: ReturnType<typeof listCareerAchievements>[number],
  claim: string,
) {
  return {
    stableKey: record.stableKey,
    experienceId: record.experienceId,
    claim,
    safeToUse: record.safeToUse,
    evidence: record.evidence,
    evidenceNarratives: record.evidenceNarratives,
    limitations: record.limitations,
    skills: record.skills,
    directions: record.directions,
    publicationIds: record.publicationIds,
  }
}

function syntheticAchievement() {
  const record = listCareerAchievements(db).find(
    (item) => item.stableKey === 'reporting-api-delivery',
  )
  if (!record) throw new Error('Synthetic achievement fixture is missing.')
  return record
}

describe('database-owned runtime career reads', () => {
  test('1. analysis and generation inputs build from the database with stable hashes', () => {
    const first = buildCandidateAnalysisInput(applicationId)
    const second = buildCandidateAnalysisInput(applicationId)
    expect(first).not.toBeNull()
    expect(first?.inputHash).toBe(second?.inputHash)
    expect(JSON.stringify(first?.snapshot)).toContain('Jordan Rivera')

    const generation = buildGenerationInput(applicationId)
    expect(generation).not.toBeNull()
    expect(generation?.inputHash).toBe(buildGenerationInput(applicationId)?.inputHash)
    expect(generation?.snapshot.evidenceHash).toHaveLength(64)
    expect(generation?.snapshot.baseResumeVersion).toBe('v1')
    expect(generation?.snapshot.draftSnapshot?.careerData.skills.length).toBeGreaterThan(0)
  })

  test('2. mutating a career-data file has no effect on runtime reads or freshness hashes', () => {
    const baseline = loadCareerData()
    const baselineHash = buildGenerationInput(applicationId)?.inputHash

    const directory = mkdtempSync(resolve(tmpdir(), 'job-tracker-disk-mutation-'))
    const previous = process.env.CAREER_DATA_DIR
    try {
      writeSyntheticCareerData(directory)
      const candidatePath = resolve(directory, 'candidate.json')
      const candidate = JSON.parse(readFileSync(candidatePath, 'utf8')) as {
        identity: { fullName: string }
      }
      candidate.identity.fullName = 'Disk Override'
      writeFileSync(candidatePath, JSON.stringify(candidate, null, 2))
      process.env.CAREER_DATA_DIR = directory

      const afterMutation = loadCareerData()
      expect(afterMutation.candidate.identity.fullName).toBe('Jordan Rivera')
      expect(afterMutation).toBe(baseline)
      expect(buildGenerationInput(applicationId)?.inputHash).toBe(baselineHash)
    } finally {
      if (previous === undefined) delete process.env.CAREER_DATA_DIR
      else process.env.CAREER_DATA_DIR = previous
      rmSync(directory, { force: true, recursive: true })
    }
  })

  test('3. an empty database returns a well-formed shape, reports onboarding, and calls no model', () => {
    const empty = createCareerTestDatabase({ seed: false })
    let fetchCalls = 0
    globalThis.fetch = (async () => {
      fetchCalls += 1
      throw new Error('The model must not be called for an empty career database.')
    }) as unknown as typeof fetch
    try {
      const data = loadCareerDataFromDatabase(empty.executor)
      expect(data.skills.skills).toEqual([])
      expect(data.experiences.experiences).toEqual([])
      expect(data.achievements.achievements).toEqual([])
      expect(data.preferences.directionDefinitions).toEqual({})
      expect(careerEvidenceIds(data).skill.size).toBe(0)
      expect(listDirections(empty.executor)).toEqual([])

      expect(careerOnboardingRequired(empty.executor)).toBe(true)
      expect(careerOnboardingRequired(database.executor)).toBe(false)
      const readiness = assessApplicationReadiness({
        hasReviewedAnalysis: false,
        analysisStatus: 'none',
        hasPendingSkillDecisions: true,
        onboardingRequired: true,
      })
      expect(readiness.ready).toBe(false)
      expect(readiness.reasons).toContain(careerOnboardingGuidance)

      // An unknown application is missing data, not a crash and not a model call.
      expect(buildGenerationInput(applicationId + 9_999)).toBeNull()
      expect(buildCandidateAnalysisInput(applicationId + 9_999)).toBeNull()
      expect(fetchCalls).toBe(0)
    } finally {
      empty.cleanup()
    }
  })

  test('4. a legacy stored snapshot stays readable without the new frozen draft field', () => {
    const legacy = {
      version: 2,
      candidateAnalysisRunId: candidateRunId,
      candidateAnalysisInputHash: 'legacy-hash',
      direction: 'fullstack',
      decisions: [],
      reasons: [],
      evidenceHash: 'legacy-evidence',
      baseResumeHash: null,
      baseResumeVersion: null,
      generationPromptVersion: '1.0.0',
      generationSchemaVersion: '1.0.0',
      rendererVersion: '1.0.0',
      resumeModel: 'gpt-legacy',
      coverLetterModel: 'gpt-legacy',
    }
    expect(frozenDraftSnapshotFromRun(JSON.stringify(legacy))).toBeNull()
    expect(frozenDraftSnapshotFromRun('{not json')).toBeNull()
    const reasons = generationStalenessReasons({ ...legacy, evidenceHash: 'new-evidence' }, legacy)
    expect(reasons).toContain('career-evidence-changed')
    expect(generationStalenessReasons(legacy, legacy)).toEqual([])
  })

  test('5. a category display-order edit does not stale unrelated documents', () => {
    const stored = buildGenerationInput(applicationId)
    expect(stored).not.toBeNull()
    const storedSnapshot = stored!.snapshot
    const currentCandidateHash = currentCandidateAnalysisHash(applicationId)
    const before = database.sqlite
      .query('SELECT key, label, sort_order FROM skill_categories ORDER BY key')
      .all() as Array<{ key: string; label: string; sort_order: number }>

    // A category display-order edit changes the catalog, never the facts, so the
    // document identity must stay untouched. The write really happened (proved
    // by the stored order below), which is the surviving equivalent of the old
    // `career_state.revision` bump: the identity is derived from the document
    // shape, not from any change counter.
    syncSkillTaxonomy(
      db,
      before.map((row) => ({
        key: row.key,
        label: row.label,
        sortOrder: 1_000 - row.sort_order,
      })),
      { apply: true },
    )
    const after = database.sqlite
      .query('SELECT key, sort_order FROM skill_categories ORDER BY key')
      .all() as Array<{ key: string; sort_order: number }>
    expect(after.map((row) => row.sort_order)).toEqual(before.map((row) => 1_000 - row.sort_order))

    const current = buildGenerationInput(applicationId)
    expect(current?.inputHash).toBe(stored?.inputHash)
    expect(generationStalenessReasons(current?.snapshot, storedSnapshot)).toEqual([])
    expect(currentCandidateAnalysisHash(applicationId)).toBe(currentCandidateHash)
    expect(candidateStalenessReasons({}, {})).toEqual([])
  })

  test('6. the probe-keyed cache returns the same object and refreshes after a career write', async () => {
    const before = loadCareerData()
    expect(loadCareerData()).toBe(before)
    const probeBefore = careerContentProbe(db)
    const achievement = syntheticAchievement()

    await Bun.sleep(2)
    updateCareerAchievement(
      db,
      achievement.id,
      achievementInput(achievement, `${achievement.claim} (cache refresh)`),
    )

    const after = loadCareerData()
    expect(after).not.toBe(before)
    expect(careerContentProbe(db)).not.toBe(probeBefore)
    expect(loadCareerData()).toBe(after)
    expect(JSON.stringify(after)).toContain('(cache refresh)')

    // Restore the authored claim so later assertions in this file stay stable.
    updateCareerAchievement(db, achievement.id, achievementInput(achievement, achievement.claim))
    expect(JSON.stringify(loadCareerData())).not.toContain('(cache refresh)')
  })

  test('7. a queued run drafts from its frozen snapshot after later career edits', async () => {
    const run = await enqueueGeneration(applicationId)
    expect(run).not.toBeNull()
    const frozenDraft = frozenDraftSnapshotFromRun(run!.frozenInputJson)
    expect(frozenDraft).not.toBeNull()
    expect(JSON.stringify(frozenDraft?.careerData.achievements)).toContain('reporting-api-delivery')

    const achievement = syntheticAchievement()
    const editedClaim = `${achievement.claim} AFTER ENQUEUE`
    updateCareerAchievement(db, achievement.id, achievementInput(achievement, editedClaim))
    expect(JSON.stringify(loadCareerData())).toContain('AFTER ENQUEUE')

    // The worker consumes the stored snapshot, so the model never sees the edit.
    const bodies: string[] = []
    process.env.OPENAI_API_KEY = 'test-key'
    globalThis.fetch = (async (_url: unknown, init: { body?: string } = {}) => {
      bodies.push(String(init.body))
      return { ok: true, json: async () => ({ output_text: 'not a document draft' }) } as Response
    }) as unknown as typeof fetch

    await generateApplicationDrafts(run!.id).catch(() => undefined)
    const sent = bodies.join('\n')
    expect(sent).toContain('Runtime Synthetic Co')
    expect(sent).not.toContain('AFTER ENQUEUE')

    updateCareerAchievement(db, achievement.id, achievementInput(achievement, achievement.claim))
  })
})
