import { expect, test } from 'bun:test'
import { Hono } from 'hono'
import middleware from '../app/routes/_middleware'
import { createBatchPost } from '../app/routes/api/v1/job-intake/batches'
import statusRoute from '../app/routes/api/v1/job-intake/batches/[id]'
import capabilities from '../app/routes/api/v1/job-intake/capabilities'
import skillReview from '../app/routes/applications/[id]/skill-review'
import fixture from '../docs/fixtures/job-intake-batch.json'
import publishedContract from '../docs/job-intake-api.openapi.json'
import {
  acceptExtensionBatch,
  extensionBatchStatus,
  prepareExtensionItem,
} from '../src/db/extension-intake'
import { captureItemSchema } from '../src/lib/job-intake/contracts'
import { intakeOpenAPI } from '../src/lib/job-intake/openapi'
import { careerTestDatabase } from './support/career-db'

test('published OpenAPI and synthetic fixture match the executable contract', () => {
  expect(publishedContract).toEqual(JSON.parse(JSON.stringify(intakeOpenAPI)))
  expect(captureItemSchema.safeParse(fixture.items[0]).success).toBe(true)
})

test('Review refresh exposes a revision probe and updates only stable review/tab/readiness fragments', async () => {
  const data = careerTestDatabase()
  try {
    const accepted = acceptExtensionBatch(
      {
        ...fixture,
        clientBatchId: crypto.randomUUID(),
        items: [
          {
            ...fixture.items[0],
            clientItemId: crypto.randomUUID(),
            sourceUrl: `https://example.com/${crypto.randomUUID()}`,
          },
        ],
      },
      crypto.randomUUID(),
    )
    const itemId = extensionBatchStatus(accepted.batchId)!.items[0].itemId
    const item = prepareExtensionItem(itemId)
    const app = new Hono()
    app.get('/applications/:id/skill-review', ...skillReview)
    const path = `/applications/${item.jobApplicationId}/skill-review`
    const probe = await (await app.request(`${path}?probe=1`)).json()
    const response = await app.request(path)
    const html = await response.text()
    expect(response.status).toBe(200)
    expect(html).toContain('id="skill-review-panel"')
    expect(html).toContain(`data-review-revision="${probe.revision}"`)
    expect(html).toContain('id="workspace-tabs"')
    expect(html).toContain('hx-swap-oob="outerHTML"')
    expect(html).toContain('data-review-filter')
    expect(html).not.toContain('<html')
    expect(html).not.toContain('id="board"')
  } finally {
    data.cleanup()
  }
})

function api() {
  const app = new Hono()
  for (const handler of middleware) app.use('*', handler)
  app.post('/api/v1/job-intake/batches', ...createBatchPost(async () => undefined))
  app.get('/api/v1/job-intake/batches/:id', ...statusRoute)
  app.get('/api/v1/job-intake/capabilities', ...capabilities)
  return app
}

test('real middleware and JSON endpoints accept/replay/query batches without website Basic Auth', async () => {
  const oldToken = process.env.JOB_INTAKE_API_TOKEN
  const oldUser = process.env.APP_AUTH_USERNAME
  const oldPassword = process.env.APP_AUTH_PASSWORD
  process.env.JOB_INTAKE_API_TOKEN = 'synthetic-extension-token'
  process.env.APP_AUTH_USERNAME = 'web-user'
  process.env.APP_AUTH_PASSWORD = 'web-password'
  try {
    const app = api()
    expect((await app.request('/api/v1/job-intake/capabilities')).status).toBe(401)
    const headers = {
      Authorization: 'Bearer synthetic-extension-token',
      'Content-Type': 'application/json',
      'Idempotency-Key': crypto.randomUUID(),
    }
    expect((await app.request('/api/v1/job-intake/capabilities', { headers })).status).toBe(200)
    const body = JSON.stringify({
      schemaVersion: 1,
      clientBatchId: crypto.randomUUID(),
      items: [
        {
          clientItemId: crypto.randomUUID(),
          sourceUrl: 'https://example.com/jobs/1',
          rawText: 'Build useful software.',
        },
        { clientItemId: crypto.randomUUID(), sourceUrl: '', rawText: '' },
      ],
    })
    const first = await app.request('/api/v1/job-intake/batches', { method: 'POST', headers, body })
    expect(first.status).toBe(202)
    const saved = await first.json()
    expect(saved.counts.rejected).toBe(1)
    expect(
      (await app.request('/api/v1/job-intake/batches', { method: 'POST', headers, body })).status,
    ).toBe(200)
    expect((await app.request(saved.statusUrl, { headers })).status).toBe(200)
    const rejected = await app.request('/api/v1/job-intake/batches', {
      method: 'POST',
      headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({
        schemaVersion: 1,
        clientBatchId: crypto.randomUUID(),
        items: [{ clientItemId: crypto.randomUUID(), sourceUrl: '', rawText: '' }],
      }),
    })
    expect(rejected.status).toBe(422)
    const rejectedBatch = await rejected.json()
    expect(rejectedBatch.isTerminal).toBe(true)
    expect(rejectedBatch.status).toBe('completed-with-errors')
    const polledRejected = await app.request(rejectedBatch.statusUrl, { headers })
    expect((await polledRejected.json()).terminalRevision).toBe(rejectedBatch.terminalRevision)
    expect((await app.request('/api/v1/job-intake/batches/99999999', { headers })).status).toBe(404)
    expect(
      (await app.request('/api/v1/job-intake/batches', { method: 'POST', headers, body: '{' }))
        .status,
    ).toBe(400)
    expect(
      (
        await app.request('/api/v1/job-intake/batches', {
          method: 'POST',
          headers: { ...headers, 'Content-Length': '99999999' },
          body: '{}',
        })
      ).status,
    ).toBe(413)
    const protectedPage = new Hono()
    for (const handler of middleware) protectedPage.use('*', handler)
    protectedPage.get('/career-data', (c) => c.text('private'))
    expect((await protectedPage.request('/career-data', { headers })).status).toBe(401)
    expect(intakeOpenAPI.components.schemas.BatchRequest.properties.items.maxItems).toBe(20)
  } finally {
    for (const [key, value] of Object.entries({
      JOB_INTAKE_API_TOKEN: oldToken,
      APP_AUTH_USERNAME: oldUser,
      APP_AUTH_PASSWORD: oldPassword,
    })) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})
