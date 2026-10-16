import { expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { completeAnalysisRun, createAnalysisRun } from '../../src/db/analysis'
import { decideRunSkill } from '../../src/db/analysis-decision-service'
import { listRunDecisions } from '../../src/db/analysis-decisions'
import { db } from '../../src/db/client'
import {
  acceptExtensionBatch,
  extensionBatchStatus,
  prepareExtensionItem,
} from '../../src/db/extension-intake'
import { listJobRequirements, persistJobRequirements } from '../../src/db/job-analysis'
import { createJobAnalysisRun } from '../../src/db/job-analysis-runs'
import { applicationAnalysisRuns } from '../../src/db/schema'
import { listRequirementSkillMappings, listRunSkillReviews } from '../../src/db/skill-queries'
import { documentSafeCareerData, loadCareerData } from '../../src/lib/career/canonical-data'
import { careerTestDatabase } from '../support/career-db'

test('personal evidence governs decisions, reasonless transfers and safe Include/Skip reuse', () => {
  // UI route tests install process-wide module mocks. Exercise real repositories
  // in a child process, with a separate disposable database, regardless of order.
  if (process.env.PERSONAL_SKILL_REVIEW_ISOLATED !== '1') {
    const root = mkdtempSync(join(tmpdir(), 'personal-skill-review-'))
    try {
      const child = Bun.spawnSync([process.execPath, 'test', import.meta.path], {
        env: {
          ...process.env,
          DB_FILE_NAME: join(root, 'jobs.db'),
          PERSONAL_SKILL_REVIEW_ISOLATED: '1',
        },
        stdout: 'pipe',
        stderr: 'pipe',
      })
      if (child.exitCode !== 0) throw new Error(new TextDecoder().decode(child.stderr))
      expect(child.exitCode).toBe(0)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
    return
  }
  const fixture = careerTestDatabase()
  try {
    const batch = acceptExtensionBatch(
      {
        schemaVersion: 1,
        clientBatchId: crypto.randomUUID(),
        items: [
          {
            clientItemId: crypto.randomUUID(),
            sourceUrl: `https://example.com/review/${crypto.randomUUID()}`,
            rawText: 'Use TypeScript and Vue.js.',
          },
        ],
      },
      crypto.randomUUID(),
    )
    const item = prepareExtensionItem(extensionBatchStatus(batch.batchId)!.items[0].itemId)
    const job = createJobAnalysisRun(db, {
      jobPostingId: item.jobPostingId!,
      inputHash: 'synthetic',
      frozenInputJson: '{}',
      model: 'test',
      promptVersion: 'test',
      schemaVersion: 'test',
    })
    db.transaction((tx) =>
      persistJobRequirements(
        tx,
        job.id,
        ['TypeScript', 'Vue.js', 'TypeScript'].map((term) => ({
          type: 'skill',
          importance: 'required',
          basis: 'explicit',
          statement: `Use ${term}`,
          sourceText: `Use ${term}`,
          inferenceRationale: null,
          terms: [{ term }],
        })),
        '2026-10-16',
      ),
    )
    const requirements = listJobRequirements(job.id)
    const mappings = listRequirementSkillMappings(job.id)
    const ts = mappings.find((row) => row.skillKey === 'typescript')!
    const vue = mappings.find((row) => row.skillId !== ts.skillId)!
    const snapshot = {
      sourceVersions: { skillReviewPolicy: 1 },
      application: { direction: 'fullstack' },
      careerData: documentSafeCareerData(loadCareerData()),
      jobAnalysis: {
        requirements: requirements.map((r) => ({
          id: r.id,
          statement: r.statement,
          sourceText: r.sourceText,
          importance: r.importance,
          type: r.requirementType,
          basis: r.basis,
        })),
      },
      skillRequirements: mappings,
    }
    const finish = (kind: 'direct' | 'transferable' | 'unknown-evidence', input = snapshot) => {
      const run = createAnalysisRun({
        jobPostingAnalysisId: job.id,
        inputHash: crypto.randomUUID(),
        inputSnapshotJson: JSON.stringify(input),
        model: 'test',
        promptVersion: 'test',
        schemaVersion: 'test',
      })
      completeAnalysisRun(
        run.id,
        JSON.stringify({
          fitRecommendation: 'apply-selectively',
          recommendationRationale: 'Synthetic evidence test',
          strengths: [],
          concerns: [],
          interviewPreparation: [],
          careerDataSuggestions: [],
          requirementAssessments: requirements.map((r, index) => ({
            jobRequirementId: r.id,
            evidenceStatus: index === 0 ? 'direct' : kind,
            evidenceRefs:
              index !== 0 && kind === 'unknown-evidence'
                ? []
                : [
                    {
                      sourceType: 'achievement',
                      sourceId: 'reporting-api-delivery',
                      relevance: index === 0 ? 'direct' : kind,
                    },
                  ],
            explanation: `Assessment ${run.id}`,
            confidence: 0.9,
          })),
        }),
      )
      return run.id
    }
    const direct = finish('direct')
    expect(listRunSkillReviews(direct).find((r) => r.skillId === ts.skillId)?.analysisResult).toBe(
      'proven-match',
    )
    expect(listRunSkillReviews(direct).find((r) => r.skillId === vue.skillId)?.analysisResult).toBe(
      'not-in-career-data',
    )
    expect(listRunDecisions(db, direct).map((r) => r.skillId)).toEqual([vue.skillId])
    expect(() =>
      decideRunSkill({ runId: direct, skillId: vue.skillId, decision: 'include', reason: null }),
    ).toThrow()

    const transfer = finish('transferable')
    expect(listRunSkillReviews(transfer).find((r) => r.skillId === ts.skillId)?.evidenceKind).toBe(
      'transferable',
    )
    decideRunSkill({ runId: transfer, skillId: ts.skillId, decision: 'include', reason: null })
    const saved = listRunDecisions(db, transfer).find((r) => r.skillId === ts.skillId)!
    expect(saved.includeBasis).toBe('transferable')
    expect(saved.reason).toBeNull()
    expect(saved.basisHash).toBeTruthy()
    const repeated = finish('transferable')
    const reused = listRunDecisions(db, repeated).find((r) => r.skillId === ts.skillId)!
    expect(reused.decision).toBe('include')
    expect(reused.previousDecisionId).toBe(saved.id)

    const changed = structuredClone(snapshot)
    changed.jobAnalysis.requirements[0]!.statement += ' at enterprise scale'
    const changedRun = finish('transferable', changed)
    expect(listRunDecisions(db, changedRun).find((r) => r.skillId === ts.skillId)?.decision).toBe(
      'pending',
    )
    decideRunSkill({ runId: changedRun, skillId: ts.skillId, decision: 'skip', reason: null })
    const skippedRun = finish('transferable', changed)
    expect(listRunDecisions(db, skippedRun).find((r) => r.skillId === ts.skillId)?.decision).toBe(
      'skip',
    )

    const unknown = finish('unknown-evidence', changed)
    expect(listRunDecisions(db, unknown).find((r) => r.skillId === ts.skillId)?.decision).toBe(
      'pending',
    )
    expect(() =>
      decideRunSkill({ runId: unknown, skillId: ts.skillId, decision: 'include', reason: null }),
    ).toThrow()
    // Historical input snapshots remain immutable after subsequent analysis runs.
    expect(
      db.select().from(applicationAnalysisRuns).where(eq(applicationAnalysisRuns.id, direct)).get()
        ?.inputSnapshotJson,
    ).toBe(JSON.stringify(snapshot))
  } finally {
    fixture.cleanup()
  }
})
