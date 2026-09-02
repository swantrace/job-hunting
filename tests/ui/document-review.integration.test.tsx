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

  test('renders the review verdict, categories, and actionable recommendation', async () => {
    mockListDocumentReviews.mockReturnValue([
      {
        id: 2,
        status: 'Completed',
        attempts: 1,
        resultJson: JSON.stringify({
          verdict: 'revise',
          summary: 'One meaningful revision remains.',
          findings: [
            {
              severity: 'important',
              document: 'cover-letter',
              category: 'cover-letter-value',
              section: 'Evidence',
              claim: 'A role-by-role recap',
              message: 'The letter repeats the resume instead of adding a focused narrative.',
              recommendedAction: 'Keep two proof themes and connect each to an employer need.',
            },
          ],
        }),
      },
    ])
    const response = await (await documentReviewHarness()).request(
      '/applications/7/generation-runs/10/reviews',
      { method: 'GET' },
    )
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(html).toContain('revise')
    expect(html).toContain('cover-letter-value')
    expect(html).toContain('Recommended action:')
    expect(html).toContain('Keep two proof themes')
    mockListDocumentReviews.mockReturnValue([])
  })
})
