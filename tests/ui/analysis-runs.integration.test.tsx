import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import type { JobCardData } from '../../src/db/queries'
import { recordsFor } from './support/html-contract'
import { mockEnqueueCandidateAnalysis, mockGetApplication, mockJob } from './support/runtime-mocks'

async function analysisRunsHarness() {
  const { POST, GET } = (await import(
    '../../app/routes/applications/[id]/analysis-runs'
  )) as Record<string, unknown>
  const app = new Hono()
  app.post('/applications/:id/analysis-runs', POST as never)
  app.get('/applications/:id/analysis-runs', GET as never)
  return app
}

describe('candidate analysis run HTMX boundaries', () => {
  test('rejects with 422 and retargets the status region before a reviewed analysis exists', async () => {
    mockGetApplication.mockReturnValue(mockJob)
    mockEnqueueCandidateAnalysis.mockClear()

    const response = await (await analysisRunsHarness()).request('/applications/7/analysis-runs', {
      method: 'POST',
    })
    const html = await response.text()

    expect(response.status).toBe(422)
    expect(html).toContain('analysis-run-status')
    expect(mockEnqueueCandidateAnalysis).not.toHaveBeenCalled()
    mockGetApplication.mockReturnValue(mockJob)
  })

  test('enqueues and returns a persisted status fragment once analysis exists', async () => {
    mockGetApplication.mockReturnValue({
      ...mockJob,
      jobPostingAnalysis: { id: 1, schemaVersion: '3.0.0' },
    } as unknown as JobCardData)
    mockEnqueueCandidateAnalysis.mockClear()

    const response = await (await analysisRunsHarness()).request('/applications/7/analysis-runs', {
      method: 'POST',
    })
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(mockEnqueueCandidateAnalysis).toHaveBeenCalledWith(7)
    expect(recordsFor(html, 'analysis-run-status')).toHaveLength(1)
    expect(html).not.toMatch(/<AppShell|<html|<body/)
    mockGetApplication.mockReturnValue(mockJob)
  })

  test('returns the status fragment for polling without a nested shell', async () => {
    mockGetApplication.mockReturnValue(mockJob)
    const response = await (await analysisRunsHarness()).request('/applications/7/analysis-runs', {
      method: 'GET',
    })
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(recordsFor(html, 'analysis-run-status')).toHaveLength(1)
    expect(html).not.toMatch(/<AppShell|<html|<body/)
  })
})
