import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { recordsFor } from './support/html-contract'
import { mockEnqueueDocumentReview, mockListDocumentReviews } from './support/runtime-mocks'

async function documentReviewHarness() {
  const { POST, GET } = (await import(
    '../../app/routes/applications/[id]/generation-runs/[runId]/reviews'
  )) as Record<string, unknown>
  const app = new Hono()
  app.post('/applications/:id/generation-runs/:runId/reviews', POST as never)
  app.get('/applications/:id/generation-runs/:runId/reviews', GET as never)
  return app
}

describe('document review HTMX boundaries', () => {
  test('enqueues an explicit review and returns a fragment without a shell', async () => {
    mockListDocumentReviews.mockReturnValue([])
    mockEnqueueDocumentReview.mockClear()

    const response = await (await documentReviewHarness()).request(
      '/applications/7/generation-runs/10/reviews',
      { method: 'POST' },
    )
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(mockEnqueueDocumentReview).toHaveBeenCalledWith(10)
    expect(recordsFor(html, 'document-review')).toHaveLength(1)
    expect(html).not.toMatch(/<AppShell|<html|<body/)
  })

  test('returns the polling fragment for a queued review', async () => {
    mockListDocumentReviews.mockReturnValue([{ id: 1, status: 'Queued', attempts: 0 }])
    const response = await (await documentReviewHarness()).request(
      '/applications/7/generation-runs/10/reviews',
      { method: 'GET' },
    )
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(recordsFor(html, 'document-review')).toHaveLength(1)
    expect(html).not.toMatch(/<AppShell|<html|<body/)
    mockListDocumentReviews.mockReturnValue([])
  })
})
