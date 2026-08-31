import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { fragmentRecords, recordsFor } from './support/html-contract'
import { mockGetApplication, mockJob, mockLoadReviewData } from './support/runtime-mocks'

/**
 * Run-status fragment integration contract. The existing candidate
 * `analysis-runs` route establishes the polling fragment pattern that the new
 * `workspace-job-analysis-status` boundary (Step 4.2) mirrors: a single
 * self-contained status fragment, no AppShell, and preserved active tab.
 */
async function createHarness() {
  const { GET, POST } = (await import(
    '../../app/routes/applications/[id]/analysis-runs'
  )) as Record<string, unknown>
  const app = new Hono()
  app.get('/applications/:id/analysis-runs', GET as never)
  app.post('/applications/:id/analysis-runs', POST as never)
  return app
}

describe('analysis run-status fragment', () => {
  test('returns one self-contained status fragment, never a nested document', async () => {
    mockGetApplication.mockReturnValue(mockJob)
    mockLoadReviewData.mockReturnValue({
      job: mockJob,
      jobAnalysis: null,
      jobAnalysisCurrent: false,
      run: null,
      state: { latest: null },
      requirements: [],
      profiles: [],
    })
    const response = await (await createHarness()).request('/applications/7/analysis-runs')
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(recordsFor(html, 'analysis-run-status')).toEqual([
      expect.objectContaining({ depth: 0, id: 'analysis-run-status' }),
    ])
    expect(
      fragmentRecords(html).filter((record) => record.id === 'analysis-run-status'),
    ).toHaveLength(1)
    expect(html).not.toMatch(/<AppShell|<html|<body/)
  })

  test('polls only the active run-status fragment and preserves the review tab', async () => {
    mockGetApplication.mockReturnValue(mockJob)
    mockLoadReviewData.mockReturnValue({
      job: mockJob,
      run: { id: 1, status: 'Queued', attempts: 0, errorMessage: null, model: null },
      requirements: [],
      profiles: [],
      jobAnalysis: null,
      jobAnalysisCurrent: false,
      state: { latest: null },
    })
    const response = await (await createHarness()).request(
      '/applications/7/analysis-runs?workspaceTab=review',
    )
    const html = await response.text()

    expect(html).toMatch(/hx-trigger="every 2s"/)
    expect(html).toMatch(/hx-get="[^"]*analysis-runs[^"]*workspaceTab=review/)
  })

  test('rejects a forged run against an unreviewed application with a targeted 422', async () => {
    mockGetApplication.mockReturnValue(mockJob)
    mockLoadReviewData.mockReturnValue({
      job: mockJob,
      jobAnalysis: null,
      jobAnalysisCurrent: false,
      run: null,
      state: { latest: null },
      requirements: [],
      profiles: [],
    })
    const response = await (await createHarness()).request('/applications/7/analysis-runs', {
      method: 'POST',
    })
    const html = await response.text()

    expect(response.status).toBe(422)
    expect(response.headers.get('HX-Retarget')).toBe('#analysis-run-status')
    expect(recordsFor(html, 'analysis-run-status')).toHaveLength(1)
  })
})

async function createJobAnalysisHarness() {
  const { GET, POST } = (await import(
    '../../app/routes/applications/[id]/job-analysis-runs'
  )) as Record<string, unknown>
  const app = new Hono()
  app.get('/applications/:id/job-analysis-runs', GET as never)
  app.post('/applications/:id/job-analysis-runs', POST as never)
  return app
}

describe('job analysis run-status fragment', () => {
  test('returns the job-analysis status fragment plus an OOB tab update', async () => {
    mockGetApplication.mockReturnValue(mockJob)
    const response = await (await createJobAnalysisHarness()).request(
      '/applications/7/job-analysis-runs',
    )
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(recordsFor(html, 'workspace-job-analysis-status')).toEqual([
      expect.objectContaining({ depth: 0, id: 'workspace-job-analysis-status' }),
    ])
    expect(recordsFor(html, 'workspace-tabs')).toEqual([
      expect.objectContaining({ id: 'workspace-tabs', oob: 'outerHTML' }),
    ])
    expect(recordsFor(html, 'analysis-run-status')).toEqual([
      expect.objectContaining({ id: 'analysis-run-status', oob: 'outerHTML' }),
    ])
    expect(recordsFor(html, 'job-analysis-summary')).toEqual([
      expect.objectContaining({ id: 'job-analysis-summary', oob: 'outerHTML' }),
    ])
    expect(html).not.toMatch(/<AppShell|<html|<body/)
  })

  test('rejects a rerun with a targeted 422 before a job post exists', async () => {
    mockGetApplication.mockReturnValue(mockJob)
    const response = await (await createJobAnalysisHarness()).request(
      '/applications/7/job-analysis-runs',
      { method: 'POST' },
    )

    expect(response.status).toBe(422)
    expect(response.headers.get('HX-Retarget')).toBe('#workspace-job-analysis-status')
  })
})
