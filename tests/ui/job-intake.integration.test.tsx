import { describe, expect, mock, test } from 'bun:test'
import { Hono } from 'hono'
import { recordsFor } from './support/html-contract'

mock.module('../../src/db/job-intake', () => ({
  createJobIntakeBatch: () => ({ id: 1 }),
  createJobIntakeItems: () => [],
  listJobIntakeBatches: () => [{ id: 1, createdAt: '2026-08-31', items: [] }],
}))
mock.module('../../src/lib/job-intake-queue', () => ({
  enqueueJobIntakeBatch: () => {},
}))
mock.module('honox/factory', () => ({ createRoute: (handler: unknown) => handler }))

async function importHarness() {
  const { POST } = (await import('../../app/routes/applications/import')) as Record<string, unknown>
  const app = new Hono()
  app.post('/applications/import', POST as never)
  return app
}

describe('batch job post intake HTMX boundaries', () => {
  test('returns only the intake panel fragment on success', async () => {
    const response = await (await importHarness()).request('/applications/import', {
      method: 'POST',
      body: new URLSearchParams({ input: 'https://jobs.example.com/role' }),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    })
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(recordsFor(html, 'job-intake')).toHaveLength(1)
    expect(html).not.toMatch(/<AppShell|<html|<body/)
  })

  test('returns 422 with the panel intact when the input is empty', async () => {
    const response = await (await importHarness()).request('/applications/import', {
      method: 'POST',
      body: new URLSearchParams({ input: '   \n\n' }),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    })
    const html = await response.text()

    expect(response.status).toBe(422)
    expect(recordsFor(html, 'job-intake')).toHaveLength(1)
    expect(html).toContain('Paste at least one URL or job description')
    expect(html).not.toMatch(/<AppShell|<html|<body/)
  })
})
