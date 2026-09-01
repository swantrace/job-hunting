import { describe, expect, mock, test } from 'bun:test'
import { Hono } from 'hono'
import { recordsFor } from './support/html-contract'

const createItems = mock(() => [])
mock.module('../../src/db/job-intake', () => ({
  createJobIntakeBatch: () => ({ id: 1 }),
  createJobIntakeItems: createItems,
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

function postBody(items: string[]) {
  const body = new URLSearchParams()
  for (const item of items) body.append('items', item)
  return body
}

describe('batch job post intake HTMX boundaries', () => {
  test('accepts multi-line pasted job descriptions as single text items', async () => {
    createItems.mockClear()
    const jd = 'Full-Stack Engineer\nExample Company\n\n- Build TypeScript products.\n- Own CI/CD.'
    const response = await (await importHarness()).request('/applications/import', {
      method: 'POST',
      body: postBody([jd]),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    })
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(recordsFor(html, 'job-intake')).toHaveLength(1)
    expect(html).not.toMatch(/<AppShell|<html|<body/)
    expect(createItems).toHaveBeenCalledWith(1, [
      expect.objectContaining({ kind: 'text', raw: jd, normalizedUrl: null }),
    ])
  })

  test('classifies a single-line URL as a URL item', async () => {
    createItems.mockClear()
    await (await importHarness()).request('/applications/import', {
      method: 'POST',
      body: postBody(['https://jobs.example.com/role']),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    })
    expect(createItems).toHaveBeenCalledWith(1, [
      expect.objectContaining({ kind: 'url', normalizedUrl: 'https://jobs.example.com/role' }),
    ])
  })

  test('returns 422 with the panel intact when all fields are empty', async () => {
    const response = await (await importHarness()).request('/applications/import', {
      method: 'POST',
      body: postBody(['   \n\n', '']),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    })
    const html = await response.text()

    expect(response.status).toBe(422)
    expect(recordsFor(html, 'job-intake')).toHaveLength(1)
    expect(html).toContain('Paste at least one job description or URL')
    expect(html).not.toMatch(/<AppShell|<html|<body/)
  })
})
