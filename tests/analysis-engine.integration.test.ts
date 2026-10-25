import { expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('durable analysis Engine owns sequencing, reuse, recovery and source projections', async () => {
  if (process.env.ANALYSIS_ENGINE_ISOLATED !== '1') {
    const root = mkdtempSync(join(tmpdir(), 'analysis-engine-'))
    try {
      const child = Bun.spawnSync([process.execPath, 'test', import.meta.path], {
        env: {
          ...process.env,
          ANALYSIS_ENGINE_ISOLATED: '1',
          DB_FILE_NAME: join(root, 'jobs.db'),
          QUEUE_FILE_NAME: join(root, 'queue.db'),
        },
        stdout: 'pipe',
        stderr: 'pipe',
      })
      if (child.exitCode !== 0) throw new Error(new TextDecoder().decode(child.stderr))
      expect(child.exitCode).toBe(0)
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
    return
  }
  const { eq } = await import('drizzle-orm')
  const { shutdownManager } = await import('bunqueue/client')
  const { db, sqlite } = await import('../src/db/client')
  const {
    analysisWorkflows,
    applicationAnalysisRuns,
    companies,
    jobApplications,
    jobPostingAnalyses,
    jobPostings,
    generationRuns,
  } = await import('../src/db/schema')
  const { createAnalysisWorkflow, getAnalysisWorkflow } = await import(
    '../src/db/analysis-workflows'
  )
  const { getJobAnalysisRun, markJobAnalysisRunProcessing } = await import(
    '../src/db/job-analysis-runs'
  )
  const { getAnalysisRun, markAnalysisRunProcessing } = await import('../src/db/analysis')
  const { prepareJobAnalysisRun, enqueueJobAnalysis } = await import(
    '../src/lib/job-analysis/queue'
  )
  const { enqueueCandidateAnalysis, prepareCandidateAnalysisRun } = await import(
    '../src/lib/analysis/queue'
  )
  const {
    analysisWorkflowName,
    getAnalysisEngine,
    dispatchAnalysisWorkflows,
    closeAnalysisEngine,
  } = await import('../src/lib/analysis/workflow')
  const { careerTestDatabase } = await import('./support/career-db')
  const { waitFor } = await import('./support/workflow')
  const fixture = careerTestDatabase()
  const now = new Date().toISOString()
  const company = db
    .insert(companies)
    .values({ name: 'Workflow Fixture', createdAt: now, updatedAt: now })
    .returning()
    .get()
  function seed() {
    const application = db
      .insert(jobApplications)
      .values({
        companyId: company.id,
        jobTitle: 'Engineer',
        direction: 'fullstack',
        priority: 'B',
        status: 'Saved',
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get()
    const posting = db
      .insert(jobPostings)
      .values({
        jobApplicationId: application.id,
        rawText: 'Build TypeScript APIs.',
        contentHash: crypto.randomUUID(),
        capturedAt: now,
      })
      .returning()
      .get()
    return { application, posting }
  }
  function requestFor(source: ReturnType<typeof seed>) {
    const prepared = prepareJobAnalysisRun(source.posting.id)
    return createAnalysisWorkflow({
      sourceKey: `test:${crypto.randomUUID()}`,
      mode: 'job-and-candidate',
      jobApplicationId: source.application.id,
      jobPostingId: source.posting.id,
      jobAnalysisRunId: prepared.run!.id,
    })
  }
  let jobs = 0
  let candidates = 0
  let releaseJob: (() => void) | undefined
  let releaseCandidate: (() => void) | undefined
  let blockJob = true
  let blockCandidate = true
  const processors = {
    job: async (id: number) => {
      jobs++
      markJobAnalysisRunProcessing(db, id)
      if (blockJob)
        await new Promise<void>((resolve) => {
          releaseJob = resolve
        })
      db.update(jobPostingAnalyses)
        .set({ status: 'Completed', completedAt: now })
        .where(eq(jobPostingAnalyses.id, id))
        .run()
    },
    candidate: async (id: number) => {
      candidates++
      expect(JSON.parse(getAnalysisRun(id)!.inputSnapshotJson!).jobAnalysis.runId).toBe(
        getAnalysisRun(id)!.jobPostingAnalysisId,
      )
      if (blockCandidate)
        await new Promise<void>((resolve) => {
          releaseCandidate = resolve
        })
      db.update(applicationAnalysisRuns)
        .set({ status: 'Completed', completedAt: now })
        .where(eq(applicationAnalysisRuns.id, id))
        .run()
    },
  }
  try {
    await getAnalysisEngine(processors)
    const source = seed()
    const first = await enqueueJobAnalysis(source.posting.id)
    await waitFor(() => !!releaseJob)
    const original = getJobAnalysisRun(db, first.run!.id)!
    expect(db.select().from(applicationAnalysisRuns).all()).toHaveLength(0)
    const again = await enqueueJobAnalysis(source.posting.id)
    expect(again.reused).toBe(true)
    expect(again.run!.id).toBe(first.run!.id)
    const shared = requestFor(source)
    await dispatchAnalysisWorkflows()
    expect(jobs).toBe(1)
    blockJob = false
    releaseJob!()
    await waitFor(
      () => !!releaseCandidate && !!getAnalysisWorkflow(shared.id)?.candidateAnalysisRunId,
    )
    const firstRequest = db
      .select()
      .from(analysisWorkflows)
      .where(eq(analysisWorkflows.sourceKey, `job-run:${first.run!.id}`))
      .get()!
    expect(getAnalysisWorkflow(shared.id)?.candidateAnalysisRunId).toBe(
      firstRequest.candidateAnalysisRunId,
    )
    expect(candidates).toBe(1)
    blockCandidate = false
    releaseCandidate!()
    await waitFor(() => getAnalysisWorkflow(shared.id)?.status === 'Completed')
    expect(getJobAnalysisRun(db, first.run!.id)?.frozenInputJson).toBe(original.frozenInputJson)
    const jobCount = jobs
    const candidateOnly = await enqueueCandidateAnalysis(source.application.id)
    await waitFor(() => getAnalysisRun(candidateOnly.run!.id)?.status === 'Completed')
    expect(jobs).toBe(jobCount)
    expect(candidates).toBe(2)
    expect(db.select().from(generationRuns).all()).toHaveLength(0)

    // A replacement posting invalidates the request before any model execution.
    const changed = seed()
    const obsolete = requestFor(changed)
    db.insert(jobPostings)
      .values({
        jobApplicationId: changed.application.id,
        version: 2,
        rawText: 'New version',
        contentHash: 'new',
        capturedAt: now,
      })
      .run()
    await dispatchAnalysisWorkflows()
    await waitFor(() => getAnalysisWorkflow(obsolete.id)?.status === 'Failed')
    expect(jobs).toBe(jobCount)
    expect(getAnalysisWorkflow(obsolete.id)?.candidateAnalysisRunId).toBeNull()

    // A persisted terminal provider failure is never retried as paid work.
    const failed = requestFor(seed())
    db.update(jobPostingAnalyses)
      .set({ status: 'Failed', errorMessage: 'Provider rejected request' })
      .where(eq(jobPostingAnalyses.id, failed.jobAnalysisRunId!))
      .run()
    await dispatchAnalysisWorkflows()
    await waitFor(() => getAnalysisWorkflow(failed.id)?.status === 'Failed')
    expect(jobs).toBe(jobCount)

    // A database record is an outbox even when no engine ID has been written.
    const undelivered = requestFor(seed())
    expect(undelivered.executionId).toBeNull()
    await dispatchAnalysisWorkflows()
    await waitFor(() => getAnalysisWorkflow(undelivered.id)?.status === 'Completed')
    expect(getAnalysisWorkflow(undelivered.id)?.executionId).toBeTruthy()
    await closeAnalysisEngine()
    shutdownManager()

    // Real process deaths, not mocks of recover(): cover both SQLite boundaries.
    for (const mode of ['after-job', 'before-publication', 'after-candidate']) {
      process.env.QUEUE_FILE_NAME = join(tmpdir(), `analysis-crash-${crypto.randomUUID()}.db`)
      const source = seed()
      const request = requestFor(source)
      const frozen = getJobAnalysisRun(db, request.jobAnalysisRunId!)!.frozenInputJson
      const child = Bun.spawnSync(
        [
          process.execPath,
          'run',
          'tests/support/analysis-workflow-process.ts',
          String(request.id),
          mode,
        ],
        { env: process.env, stdout: 'pipe', stderr: 'pipe' },
      )
      if (![73, 74, 76].includes(child.exitCode))
        throw new Error(new TextDecoder().decode(child.stderr))
      expect(child.exitCode).toBe(
        mode === 'after-job' ? 73 : mode === 'before-publication' ? 74 : 76,
      )
      // Its execution was durable even though the business ID wasn't linked yet.
      expect(getAnalysisWorkflow(request.id)?.executionId).toBeNull()
      const current = await getAnalysisEngine(processors)
      await waitFor(() => getAnalysisWorkflow(request.id)?.status === 'Completed')
      expect(
        current
          .listExecutions(analysisWorkflowName)
          .filter((e) => (e.input as { requestId: number }).requestId === request.id),
      ).toHaveLength(1)
      expect(getJobAnalysisRun(db, request.jobAnalysisRunId!)?.attempts).toBe(1)
      expect(getJobAnalysisRun(db, request.jobAnalysisRunId!)?.frozenInputJson).toBe(frozen)
      expect(getAnalysisWorkflow(request.id)?.jobAnalysisRunId).toBe(request.jobAnalysisRunId)
      await closeAnalysisEngine()
      shutdownManager()
      for (const suffix of ['', '-wal', '-shm'])
        rmSync(`${process.env.QUEUE_FILE_NAME}${suffix}`, { force: true })
    }
    // Upgrade legacy Queued/Processing runs that have no workflow record yet.
    const legacySource = seed()
    const legacyJob = prepareJobAnalysisRun(legacySource.posting.id).run!
    markJobAnalysisRunProcessing(db, legacyJob.id)
    const legacyFrozen = legacyJob.frozenInputJson
    const candidateSource = seed()
    const completedJob = prepareJobAnalysisRun(candidateSource.posting.id).run!
    db.update(jobPostingAnalyses)
      .set({ status: 'Completed', completedAt: now })
      .where(eq(jobPostingAnalyses.id, completedJob.id))
      .run()
    const legacyCandidate = prepareCandidateAnalysisRun(candidateSource.application.id).run!
    markAnalysisRunProcessing(legacyCandidate.id)
    const legacyCandidateFrozen = legacyCandidate.inputSnapshotJson
    process.env.QUEUE_FILE_NAME = join(tmpdir(), `analysis-upgrade-${crypto.randomUUID()}.db`)
    await getAnalysisEngine(processors)
    const { recoverAnalysisWorkflows } = await import('../src/lib/analysis/recovery')
    await recoverAnalysisWorkflows()
    await waitFor(
      () =>
        getJobAnalysisRun(db, legacyJob.id)?.status === 'Completed' &&
        getAnalysisRun(legacyCandidate.id)?.status === 'Completed',
    )
    expect(getJobAnalysisRun(db, legacyJob.id)?.frozenInputJson).toBe(legacyFrozen)
    expect(getAnalysisRun(legacyCandidate.id)?.inputSnapshotJson).toBe(legacyCandidateFrozen)
    expect(
      db
        .select()
        .from(analysisWorkflows)
        .where(eq(analysisWorkflows.sourceKey, `job-run:${legacyJob.id}`))
        .get()?.jobAnalysisRunId,
    ).toBe(legacyJob.id)
    expect(
      db
        .select()
        .from(analysisWorkflows)
        .where(eq(analysisWorkflows.sourceKey, `candidate-run:${legacyCandidate.id}`))
        .get()?.candidateAnalysisRunId,
    ).toBe(legacyCandidate.id)
    expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
  } finally {
    releaseJob?.()
    releaseCandidate?.()
    await closeAnalysisEngine()
    shutdownManager()
    fixture.cleanup()
  }
}, 30000)
