import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Hono } from 'hono'
import { fragmentRecords, recordsFor } from './support/html-contract'
import { mockApplicationSafeParse, mockStatusSafeParse } from './support/runtime-mocks'

async function createRouteHarness() {
  const { PATCH: statusRoute } = (await import(
    '../../app/routes/applications/[id]/status'
  )) as Record<string, unknown>
  const { PUT: applicationRoute } = (await import(
    '../../app/routes/applications/[id]/index'
  )) as Record<string, unknown>
  const { default: workspaceRoute } = (await import(
    '../../app/routes/applications/[id]/workspace'
  )) as Record<string, unknown>
  const app = new Hono()
  app.get('/applications/:id/workspace', workspaceRoute as never)
  app.put('/applications/:id', applicationRoute as never)
  app.patch('/applications/:id/status', statusRoute as never)
  return app
}

describe('workspace HTMX response boundaries', () => {
  test('workspace route returns one stable shell, tab list, and application panel', async () => {
    const response = await (await createRouteHarness()).request(
      '/applications/7/workspace?workspaceTab=application',
    )
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(recordsFor(html, 'workspace-shell')).toHaveLength(1)
    expect(recordsFor(html, 'workspace-tabs')).toHaveLength(1)
    expect(recordsFor(html, 'workspace-application-panel')).toHaveLength(1)
  })

  test('workspace response includes the future Documents boundary without duplicate IDs', async () => {
    const response = await (await createRouteHarness()).request(
      '/applications/7/workspace?workspaceTab=documents',
    )
    const html = await response.text()
    const records = fragmentRecords(html)

    expect(recordsFor(html, 'workspace-documents-panel')).toHaveLength(1)
    for (const id of [
      'workspace-shell',
      'workspace-tabs',
      'workspace-application-panel',
      'workspace-contacts-panel',
      'workspace-activity-panel',
      'workspace-documents-panel',
    ]) {
      expect(records.filter((record) => record.id === id).length).toBeLessThanOrEqual(1)
    }
  })

  test('preserves the requested active tab in the server-rendered tab state', async () => {
    const response = await (await createRouteHarness()).request(
      '/applications/7/workspace?workspaceTab=documents',
    )
    const html = await response.text()
    const documentsTab = html.match(/<button\b[^>]*\bid="workspace-tab-documents"[^>]*>/)?.[0]

    expect(documentsTab).toBeDefined()
    expect(documentsTab).toContain('aria-selected="true"')
    expect(documentsTab).toContain('aria-controls="workspace-documents-panel"')
  })

  test('preserves the Review panel and skill-review boundaries alongside new analysis fragments', async () => {
    const response = await (await createRouteHarness()).request(
      '/applications/7/workspace?workspaceTab=review',
    )
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(recordsFor(html, 'workspace-review-panel')).toHaveLength(1)
    expect(recordsFor(html, 'skill-review-panel')).toHaveLength(1)
    expect(recordsFor(html, 'workspace-tabs')).toHaveLength(1)
    expect(html).not.toMatch(/<AppShell|<html|<body/)
  })

  test('preserves the review status, readiness, and generation boundaries exactly once', async () => {
    const response = await (await createRouteHarness()).request(
      '/applications/7/workspace?workspaceTab=review',
    )
    const html = await response.text()
    const records = fragmentRecords(html)

    for (const id of [
      'analysis-run-status',
      'requirement-readiness',
      'workspace-documents-panel',
      'generation-panel',
    ]) {
      expect(records.filter((record) => record.id === id)).toHaveLength(1)
    }
  })
})

describe('status mutation HTMX response boundaries', () => {
  test('returns board as the main fragment and metrics/header as top-level OOB siblings', async () => {
    mockStatusSafeParse.mockReturnValue({ data: { action: 'today' }, success: true })
    const response = await (await createRouteHarness()).request('/applications/7/status', {
      method: 'PATCH',
    })
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(recordsFor(html, 'board')).toEqual([
      expect.objectContaining({ depth: 0, id: 'board', oob: undefined }),
    ])
    expect(recordsFor(html, 'metrics')).toEqual([
      expect.objectContaining({ depth: 0, id: 'metrics', oob: 'outerHTML' }),
    ])
    expect(recordsFor(html, 'workspace-header')).toEqual([
      expect.objectContaining({ depth: 0, id: 'workspace-header', oob: 'outerHTML' }),
    ])
  })

  test('keeps the board intact when a 422 status transition is rejected', async () => {
    mockStatusSafeParse.mockReturnValue({ success: false } as never)
    const response = await (await createRouteHarness()).request('/applications/7/status', {
      method: 'PATCH',
    })
    const html = await response.text()

    expect(response.status).toBe(422)
    expect(recordsFor(html, 'board')).toHaveLength(1)
    expect(recordsFor(html, 'flash')).toEqual([
      expect.objectContaining({ depth: 0, id: 'flash', oob: 'innerHTML' }),
    ])
  })
})

describe('422 form fragment boundaries', () => {
  test('returns only a target-compatible application form on validation failure', async () => {
    mockApplicationSafeParse.mockReturnValue({
      error: {
        flatten: () => ({ fieldErrors: { jobTitle: ['Job title is required.'] } }),
      },
      success: false,
    })
    const response = await (await createRouteHarness()).request('/applications/7', {
      body: new URLSearchParams({ jobTitle: '' }),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'PUT',
    })
    const html = await response.text()

    expect(response.status).toBe(422)
    expect(recordsFor(html, 'application-form')).toEqual([
      expect.objectContaining({ depth: 0, id: 'application-form' }),
    ])
    expect(recordsFor(html, 'board')).toHaveLength(0)
    expect(recordsFor(html, 'metrics')).toHaveLength(0)
  })
})

describe('application save response envelope', () => {
  test('returns one form main fragment plus top-level OOB board/metrics/header/flash', async () => {
    mockApplicationSafeParse.mockReturnValue({ success: true, data: {} } as never)
    const response = await (await createRouteHarness()).request('/applications/7', {
      body: new URLSearchParams({ jobTitle: 'Updated' }),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'PUT',
    })
    const html = await response.text()

    expect(response.status).toBe(200)
    for (const id of ['application-form', 'board', 'metrics', 'workspace-header', 'flash']) {
      expect(recordsFor(html, id).length).toBeLessThanOrEqual(1)
    }
    expect(recordsFor(html, 'application-form')).toEqual([
      expect.objectContaining({ depth: 0, id: 'application-form', oob: undefined }),
    ])
    for (const id of ['board', 'metrics', 'workspace-header']) {
      expect(recordsFor(html, id)).toEqual([
        expect.objectContaining({ depth: 0, id, oob: 'outerHTML' }),
      ])
    }
    expect(recordsFor(html, 'flash')).toEqual([
      expect.objectContaining({ depth: 0, id: 'flash', oob: 'innerHTML' }),
    ])
  })
})

describe('global HTMX validation response policy', () => {
  test('explicitly opts 422 responses into swapping without treating every 4xx as swappable', () => {
    const renderer = readFileSync(resolve(process.cwd(), 'app/routes/_renderer.tsx'), 'utf8')

    expect(renderer).toMatch(/responseHandling|htmx:beforeSwap/)
    expect(renderer).toMatch(/422/)
    expect(renderer).not.toMatch(/[45]\\d\\d.*swap:\s*true/)
  })
})

describe('validation error fragment contracts', () => {
  test('career-documents 422 returns the full baseline panel, not a bare alert', async () => {
    const { POST } = (await import('../../app/routes/career-documents/generation-runs')) as Record<
      string,
      unknown
    >
    const app = new Hono()
    app.post('/career-documents/generation-runs', POST as never)
    const response = await app.request('/career-documents/generation-runs', { method: 'POST' })
    const html = await response.text()

    expect(response.status).toBe(422)
    expect(recordsFor(html, 'baseline-generation-panel')).toEqual([
      expect.objectContaining({ depth: 0, id: 'baseline-generation-panel' }),
    ])
  })

  test('management 422 returns the full management content, not a bare alert', async () => {
    const { POST } = (await import('../../app/routes/manage/skills')) as Record<string, unknown>
    const app = new Hono()
    app.post('/manage/skills', POST as never)
    const response = await app.request('/manage/skills', { method: 'POST' })
    const html = await response.text()

    expect(response.status).toBe(422)
    expect(recordsFor(html, 'management-content')).toEqual([
      expect.objectContaining({ depth: 0, id: 'management-content' }),
    ])
  })
})
