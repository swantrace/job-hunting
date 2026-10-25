import { expect, mock, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('Continue to Documents uses the same effective skill decisions as tab availability', async () => {
  if (process.env.WORKSPACE_READINESS_ISOLATED !== '1') {
    const root = mkdtempSync(join(tmpdir(), 'workspace-readiness-'))
    try {
      const child = Bun.spawnSync([process.execPath, 'test', import.meta.path], {
        env: {
          ...process.env,
          WORKSPACE_READINESS_ISOLATED: '1',
          DB_FILE_NAME: join(root, 'jobs.db'),
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

  // Keep real repositories and tab gates, but never contact Google or an AI provider.
  mock.module('../src/lib/google/drive', () => ({
    getGoogleDriveConnectionStatus: async () => ({ state: 'not-connected' }),
  }))
  const { Hono } = await import('hono')
  const { and, eq } = await import('drizzle-orm')
  const { db } = await import('../src/db/client')
  const { careerTestDatabase } = await import('./support/career-db')
  const { companies, jobApplications, analysisRunDecisions, jobPostingAnalyses } = await import(
    '../src/db/schema'
  )
  const { saveJobPostingVersion, createJobAnalysisRun } = await import(
    '../src/db/job-analysis-runs'
  )
  const { persistJobRequirements, listJobRequirements } = await import('../src/db/job-analysis')
  const { listRequirementSkillMappings, listRunSkillReviews } = await import(
    '../src/db/skill-queries'
  )
  const { createAnalysisRun, completeAnalysisRun } = await import('../src/db/analysis')
  const { decideRunSkill } = await import('../src/db/analysis-decision-service')
  const { buildJobAnalysisInput } = await import('../src/lib/job-analysis/input')
  const { buildCandidateAnalysisInput } = await import('../src/lib/candidate/analysis')
  const { candidateFitPromptVersion } = await import('../src/ai/prompts/candidate-fit')
  const { jobAnalysisSchemaVersion } = await import('../src/ai/schemas/job-analysis')
  const { candidateFitSchemaVersion } = await import('../src/ai/schemas/candidate-fit')
  const { getApplicationReadiness } = await import('../src/lib/applications/readiness')
  const { computeWorkspaceAvailability } = await import('../src/lib/workspace/availability')
  const { hasPendingRunDecisions } = await import('../src/db/analysis-decisions')
  const { default: workspaceRoute } = await import('../app/routes/applications/[id]/workspace')
  const fixture = careerTestDatabase()
  try {
    const date = '2026-10-17'
    const company = db
      .insert(companies)
      .values({ name: 'Workspace Company', createdAt: date, updatedAt: date })
      .returning()
      .get()
    const application = db
      .insert(jobApplications)
      .values({
        companyId: company.id,
        jobTitle: 'Engineer',
        direction: 'fullstack',
        priority: 'B',
        status: 'Saved',
        postedDate: date,
        createdAt: date,
        updatedAt: date,
      })
      .returning()
      .get()
    const posting = saveJobPostingVersion(
      db,
      application.id,
      'Build TypeScript and Vue.js applications.',
    )
    const builtJob = buildJobAnalysisInput(db, posting.jobPostingId)!
    const jobRun = createJobAnalysisRun(db, {
      jobPostingId: posting.jobPostingId,
      inputHash: builtJob.inputHash,
      frozenInputJson: JSON.stringify(builtJob.snapshot),
      model: 'test',
      promptVersion: 'test',
      schemaVersion: jobAnalysisSchemaVersion,
    })
    persistJobRequirements(
      db,
      jobRun.id,
      ['TypeScript', 'Vue.js'].map((term) => ({
        type: 'skill',
        importance: 'required',
        basis: 'explicit',
        statement: `Use ${term}`,
        sourceText: `Use ${term}`,
        inferenceRationale: null,
        terms: [{ term }],
      })),
      date,
    )
    db.update(jobPostingAnalyses)
      .set({ status: 'Completed', completedAt: date })
      .where(eq(jobPostingAnalyses.id, jobRun.id))
      .run()
    const built = buildCandidateAnalysisInput(application.id)!
    const createCandidate = () =>
      createAnalysisRun({
        jobPostingAnalysisId: jobRun.id,
        inputHash: built.inputHash,
        inputSnapshotJson: JSON.stringify(built.snapshot),
        model: 'test',
        promptVersion: candidateFitPromptVersion,
        schemaVersion: candidateFitSchemaVersion,
      })
    const run = createCandidate()
    completeAnalysisRun(
      run.id,
      JSON.stringify({
        fitRecommendation: 'apply-selectively',
        recommendationRationale: 'Test',
        strengths: [],
        concerns: [],
        interviewPreparation: [],
        careerDataSuggestions: [],
        requirementAssessments: listJobRequirements(jobRun.id).map((requirement) => ({
          jobRequirementId: requirement.id,
          evidenceStatus: 'unknown-evidence',
          evidenceRefs: [],
          explanation: 'Requirement-level assessment does not determine skill possession.',
          confidence: 0.9,
        })),
      }),
    )
    const mappings = listRequirementSkillMappings(jobRun.id)
    const ts = mappings.find((row) => row.skillKey === 'typescript')!
    const vue = mappings.find((row) => row.skillKey !== 'typescript')!
    expect(
      listRunSkillReviews(run.id).find((row) => row.skillId === ts.skillId)?.analysisResult,
    ).toBe('proven-match')

    // Legacy records can leave a pending decision for a now-proven personal skill.
    db.insert(analysisRunDecisions)
      .values({
        applicationAnalysisRunId: run.id,
        skillId: ts.skillId,
        decision: 'pending',
        createdAt: date,
        updatedAt: date,
      })
      .run()
    expect(getApplicationReadiness(application.id).ready).toBe(false)
    expect(computeWorkspaceAvailability(application.id).reviewReady).toBe(false)
    decideRunSkill({ runId: run.id, skillId: vue.skillId, decision: 'skip', reason: null })
    expect(hasPendingRunDecisions(db, run.id)).toBe(true)
    expect(getApplicationReadiness(application.id).ready).toBe(true)
    expect(computeWorkspaceAvailability(application.id).reviewReady).toBe(true)

    const app = new Hono().get('/applications/:id/workspace', ...workspaceRoute)
    const response = await app.request(
      `/applications/${application.id}/workspace?workspaceTab=documents&q=Engineer&sort=company_asc`,
      { headers: { 'HX-Request': 'true' } },
    )
    const html = await response.text()
    expect(response.status).toBe(200)
    expect(html.match(/id="workspace-tab-documents"[^>]*/)?.[0]).toContain('aria-selected="true"')
    expect(html.match(/id="workspace-documents-panel"[^>]*/)?.[0]).not.toContain('hidden')
    expect(html.match(/id="workspace-tab-application"[^>]*/)?.[0]).toContain(
      'aria-selected="false"',
    )
    expect(html).toContain('Continue to Documents')
    expect(html).not.toContain('<html')
    expect(html.match(/id="workspace-shell"/g)).toHaveLength(1)

    // Conversely, a historical reasonless Include is effectively pending even
    // when no physical row is pending. It must not unlock Documents.
    db.delete(analysisRunDecisions)
      .where(
        and(
          eq(analysisRunDecisions.applicationAnalysisRunId, run.id),
          eq(analysisRunDecisions.skillId, ts.skillId),
        ),
      )
      .run()
    db.update(analysisRunDecisions)
      .set({ decision: 'include', reason: null, includeBasis: 'transferable' })
      .where(
        and(
          eq(analysisRunDecisions.applicationAnalysisRunId, run.id),
          eq(analysisRunDecisions.skillId, vue.skillId),
        ),
      )
      .run()
    expect(hasPendingRunDecisions(db, run.id)).toBe(false)
    expect(getApplicationReadiness(application.id).ready).toBe(false)
    expect(computeWorkspaceAvailability(application.id).reviewReady).toBe(false)
    const locked = await (
      await app.request(`/applications/${application.id}/workspace?workspaceTab=documents`, {
        headers: { 'HX-Request': 'true' },
      })
    ).text()
    expect(locked).not.toContain('Continue to Documents')
    expect(locked.match(/id="workspace-tab-documents"[^>]*/)?.[0]).toContain('aria-disabled="true"')

    // A new in-flight analysis cannot be bypassed using an older completed run.
    decideRunSkill({ runId: run.id, skillId: vue.skillId, decision: 'skip', reason: null })
    createCandidate()
    expect(getApplicationReadiness(application.id).ready).toBe(false)
    expect(computeWorkspaceAvailability(application.id).reviewReady).toBe(false)
  } finally {
    fixture.cleanup()
  }
})
