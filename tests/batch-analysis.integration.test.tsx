import { expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('batch analysis persists isolated pipelines, validates requests and preserves fragment boundaries', async () => {
  // Real repositories and routes must not inherit process-wide UI test mocks.
  if (process.env.BATCH_ANALYSIS_ISOLATED !== '1') {
    const root = mkdtempSync(join(tmpdir(), 'batch-analysis-'))
    try {
      const child = Bun.spawnSync([process.execPath, 'test', import.meta.path], {
        env: {
          ...process.env,
          BATCH_ANALYSIS_ISOLATED: '1',
          DB_FILE_NAME: join(root, 'jobs.db'),
          QUEUE_FILE_NAME: join(root, 'bunqueue.db'),
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
  const { eq } = await import('drizzle-orm')
  const { Hono } = await import('hono')
  const { db, sqlite } = await import('../src/db/client')
  const {
    companies,
    jobApplications,
    jobPostings,
    batchAnalysisItems,
    jobPostingAnalyses,
    applicationAnalysisRuns,
    generationRuns,
    analysisWorkflows,
    jobIntakeItems,
    jobIntakeBatches,
  } = await import('../src/db/schema')
  const { careerTestDatabase } = await import('./support/career-db')
  const fixture = careerTestDatabase()
  const { getAnalysisEngine, closeAnalysisEngine } = await import('../src/lib/analysis/workflow')
  const { waitFor } = await import('./support/workflow')
  const {
    createAnalysisBatch,
    advanceBatchAnalyses,
    listBatchAnalysisItems,
    latestAnalysisBatchId,
  } = await import('../src/lib/analysis/batch')
  const { batchAnalysisRequestSchema } = await import('../src/lib/analysis/batch-contract')
  const routes = await import('../app/routes/applications/batch-analysis')
  const { Board } = await import('../app/components/dashboard/Dashboard')
  const { BatchAnalysisStatus } = await import('../app/components/applications/BatchAnalysisStatus')
  const { listApplications } = await import('../src/db/queries')
  const { filterSchema } = await import('../src/lib/validation')
  const { renderToString } = await import('hono/jsx/dom/server')
  const date = '2026-10-16'
  const company = db
    .insert(companies)
    .values({ name: 'Batch Company', createdAt: date, updatedAt: date })
    .returning()
    .get()
  const seed = (title: string, withText = true) => {
    const app = db
      .insert(jobApplications)
      .values({
        companyId: company.id,
        jobTitle: title,
        direction: 'fullstack',
        postedDate: date,
        priority: 'B',
        status: 'Saved',
        createdAt: date,
        updatedAt: date,
      })
      .returning()
      .get()
    const posting = withText
      ? db
          .insert(jobPostings)
          .values({
            jobApplicationId: app.id,
            rawText: 'Build TypeScript web applications',
            contentHash: crypto.randomUUID(),
            capturedAt: date,
          })
          .returning()
          .get()
      : undefined
    return { app, posting }
  }
  const calls: string[] = []
  let releaseCandidate: (() => void) | undefined
  let blockCandidate = true
  await getAnalysisEngine({
    job: async (runId) => {
      calls.push(`job:${runId}`)
      const run = db
        .select()
        .from(jobPostingAnalyses)
        .where(eq(jobPostingAnalyses.id, runId))
        .get()!
      const application = db
        .select()
        .from(jobApplications)
        .where(
          eq(
            jobApplications.id,
            db.select().from(jobPostings).where(eq(jobPostings.id, run.jobPostingId)).get()!
              .jobApplicationId,
          ),
        )
        .get()!
      if (application.jobTitle === 'Fails') throw new Error('Bad post')
      db.update(jobPostingAnalyses)
        .set({ status: 'Completed', completedAt: date })
        .where(eq(jobPostingAnalyses.id, runId))
        .run()
    },
    candidate: async (runId) => {
      calls.push(`candidate:${runId}`)
      if (blockCandidate)
        await new Promise<void>((resolve) => {
          releaseCandidate = resolve
        })
      db.update(applicationAnalysisRuns)
        .set({ status: 'Completed', completedAt: date })
        .where(eq(applicationAnalysisRuns.id, runId))
        .run()
    },
  })

  expect(
    batchAnalysisRequestSchema.safeParse({ mode: 'forged', applicationIds: [1] }).success,
  ).toBe(false)
  for (const ids of [[], [0], [-1], ['bad'], [1.5], Array.from({ length: 201 }, (_, i) => i + 1)])
    expect(
      batchAnalysisRequestSchema.safeParse({ mode: 'candidate-only', applicationIds: ids }).success,
    ).toBe(false)

  const first = seed('First')
  const missing = seed('No text', false)
  const batch = createAnalysisBatch({
    mode: 'job-and-candidate',
    applicationIds: [first.app.id, first.app.id, missing.app.id, 999999],
  })
  expect(listBatchAnalysisItems(batch)).toHaveLength(3)
  expect(listBatchAnalysisItems(batch).map((row) => row.status)).toEqual([
    'queued',
    'skipped',
    'skipped',
  ])
  expect(latestAnalysisBatchId()).toBe(batch)
  expect(
    listBatchAnalysisItems(
      createAnalysisBatch({ mode: 'job-and-candidate', applicationIds: [first.app.id] }),
    )[0].status,
  ).toBe('skipped')
  await advanceBatchAnalyses()
  await waitFor(
    () => listBatchAnalysisItems(batch)[0].status === 'candidate-analysis' && !!releaseCandidate,
  )
  expect(calls.filter((c) => c.startsWith('job:'))).toHaveLength(1)
  expect(listBatchAnalysisItems(batch)[0].candidateAnalysisRunId).toBeTruthy()
  blockCandidate = false
  releaseCandidate!()
  await waitFor(() => listBatchAnalysisItems(batch)[0].status === 'completed')
  await advanceBatchAnalyses()
  expect(calls).toHaveLength(2)
  expect(db.select().from(generationRuns).all()).toHaveLength(0)
  expect(
    db.select().from(jobApplications).where(eq(jobApplications.id, first.app.id)).get()?.status,
  ).toBe('Saved')

  const noJob = seed('Needs Job Post')
  expect(
    listBatchAnalysisItems(
      createAnalysisBatch({ mode: 'candidate-only', applicationIds: [noJob.app.id] }),
    )[0].status,
  ).toBe('skipped')
  const candidateBatch = createAnalysisBatch({
    mode: 'candidate-only',
    applicationIds: [first.app.id],
  })
  await advanceBatchAnalyses()
  await waitFor(() => listBatchAnalysisItems(candidateBatch)[0].status === 'completed')
  expect(listBatchAnalysisItems(candidateBatch)[0].jobAnalysisRunId).toBeNull()
  expect(calls.filter((c) => c.startsWith('job:'))).toHaveLength(1)

  const bad = seed('Fails')
  const good = seed('Continues')
  const mixed = createAnalysisBatch({
    mode: 'job-and-candidate',
    applicationIds: [bad.app.id, good.app.id],
  })
  await advanceBatchAnalyses()
  await waitFor(() =>
    listBatchAnalysisItems(mixed).every((i) => ['completed', 'failed'].includes(i.status)),
  )
  expect(listBatchAnalysisItems(mixed).map((i) => i.status)).toEqual(['failed', 'completed'])
  expect(listBatchAnalysisItems(mixed)[0].errorMessage).toContain('Bad post')

  const replaced = seed('Replaced post')
  const replacedBatch = createAnalysisBatch({
    mode: 'job-and-candidate',
    applicationIds: [replaced.app.id],
  })
  db.insert(jobPostings)
    .values({
      jobApplicationId: replaced.app.id,
      version: 2,
      rawText: 'New post',
      contentHash: 'changed',
      capturedAt: date,
    })
    .run()
  const removed = seed('Removed application')
  const removedBatch = createAnalysisBatch({
    mode: 'job-and-candidate',
    applicationIds: [removed.app.id],
  })
  db.delete(jobApplications).where(eq(jobApplications.id, removed.app.id)).run()
  await advanceBatchAnalyses()
  expect(listBatchAnalysisItems(replacedBatch)[0].status).toBe('failed')
  expect(listBatchAnalysisItems(removedBatch)[0].status).toBe('failed')

  const imported = seed('Imported')
  const intakeBatch = db
    .insert(jobIntakeBatches)
    .values({ createdAt: date, updatedAt: date })
    .returning()
    .get()
  db.insert(jobIntakeItems)
    .values({
      batchId: intakeBatch.id,
      sequence: 1,
      kind: 'text',
      raw: 'text',
      jobApplicationId: imported.app.id,
      jobPostingId: imported.posting!.id,
      pipelineStatus: 'processing',
      createdAt: date,
      updatedAt: date,
    })
    .run()
  expect(
    listBatchAnalysisItems(
      createAnalysisBatch({ mode: 'job-and-candidate', applicationIds: [imported.app.id] }),
    )[0].status,
  ).toBe('skipped')
  db.update(jobIntakeItems)
    .set({ pipelineStatus: 'completed' })
    .where(eq(jobIntakeItems.batchId, intakeBatch.id))
    .run()
  expect(
    listBatchAnalysisItems(
      createAnalysisBatch({ mode: 'job-and-candidate', applicationIds: [imported.app.id] }),
    )[0].status,
  ).toBe('queued')

  const app = new Hono()
    .post('/applications/batch-analysis', ...routes.POST)
    .get('/applications/batch-analysis', ...routes.GET)
  for (const values of [
    { mode: 'forged', applicationIds: ['1'] },
    { mode: 'candidate-only', applicationIds: [] },
  ]) {
    const form = new FormData()
    form.set('mode', values.mode)
    for (const id of values.applicationIds) form.append('applicationIds', id)
    const response = await app.request('/applications/batch-analysis', {
      method: 'POST',
      body: form,
    })
    expect(response.status).toBe(422)
    expect(await response.text()).toContain('id="batch-analysis-status"')
  }
  const before = db.select().from(batchAnalysisItems).all().length
  const response = await app.request(`/applications/batch-analysis?batchId=${batch}`)
  const html = await response.text()
  expect(response.status).toBe(200)
  expect(html).toContain('id="batch-analysis-status"')
  expect(html).not.toContain('<html')
  expect(html).not.toContain('id="board"')
  expect(html).not.toContain('hx-trigger="every 3s"')
  expect(db.select().from(batchAnalysisItems).all()).toHaveLength(before)
  expect((await app.request('/applications/batch-analysis?batchId=missing')).status).toBe(404)
  const activeBatch = createAnalysisBatch({ mode: 'candidate-only', applicationIds: [good.app.id] })
  const activeHtml = renderToString(<BatchAnalysisStatus batchId={activeBatch} />)
  expect(activeHtml).toContain('every 3s')
  expect(activeHtml).not.toContain('Provider') // Per-item failures are scoped to their batch.
  expect(activeHtml).toContain('hx-include="#filters"')

  for (const view of ['list', 'board']) {
    const filters = filterSchema.parse({ view })
    const boardHtml = renderToString(<Board jobs={listApplications(filters)} filters={filters} />)
    expect(boardHtml).toContain('data-application-selection')
    expect(boardHtml).toContain('data-select-all-applications')
    expect(boardHtml).toContain('hx-post="/applications/batch-analysis"')
    expect(boardHtml).toContain('hx-target="#batch-analysis-status"')
    expect(boardHtml).toContain('candidate-only')
    expect(boardHtml).toContain('job-and-candidate')
  }
  // No live work is dispatched by the HTTP test; valid skipped requests still return a fragment.
  db.update(batchAnalysisItems).set({ status: 'skipped' }).run()
  const validForm = new FormData()
  validForm.set('mode', 'candidate-only')
  validForm.append('applicationIds', '999999')
  const validPost = await app.request('/applications/batch-analysis', {
    method: 'POST',
    body: validForm,
  })
  expect(validPost.status).toBe(200)
  const validHtml = await validPost.text()
  expect(validHtml).toContain('Skipped')
  expect(validHtml).toContain('id="batch-analysis-status"')
  expect(validHtml).not.toContain('id="board"')
  expect(validHtml).not.toContain('<html')
  expect(db.select().from(analysisWorkflows).all().length).toBeGreaterThan(0)
  expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
  await closeAnalysisEngine()
  fixture.cleanup()
}, 20000)
