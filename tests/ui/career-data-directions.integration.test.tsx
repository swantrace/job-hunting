import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import {
  listAllBaseResumeVersions,
  selectedApprovedBaseResume,
} from '../../src/db/career-base-resumes'
import { createCareerDirection, listCareerDirections } from '../../src/db/career-directions'
import { db, sqlite } from '../../src/db/client'
import { baseResumeTextHash } from '../../src/lib/base-resumes'
import { recordsFor } from './support/html-contract'

/**
 * directions route acceptance for the directions and Base Resume tabs.
 *
 * Every route resolves the real `db` singleton, so the acceptance criteria are
 * proved end to end through the repositories. Fixture rows use the
 * `career-ui10` marker and are removed before and after every test; the
 * developer's `jobs.db` is never opened.
 */

const marker = '__career-ui10'
const keyPrefix = 'career-ui10'

const markdownV1 = `# Jordan Rivera

## Summary

Synthetic step 10 draft.`
const markdownV2 = `${markdownV1}\nEdited replacement line.`

function markerDirections() {
  return listCareerDirections(db, { includeRetired: true }).filter((row) =>
    row.key.startsWith(keyPrefix),
  )
}

function markerBaseResumes() {
  return listAllBaseResumeVersions(db).filter((row) => row.directionKey.startsWith(keyPrefix))
}

function seedDirection(key = `${keyPrefix}-fullstack`) {
  createCareerDirection(db, {
    key,
    label: `${marker} Full-stack`,
    targetTitles: ['Full-Stack Developer'],
  })
  return key
}

function cleanup() {
  sqlite.query(`DELETE FROM career_base_resumes WHERE direction_key LIKE '${keyPrefix}%'`).run()
  sqlite.query(`DELETE FROM career_directions WHERE key LIKE '${keyPrefix}%'`).run()
}

beforeEach(cleanup)
afterAll(cleanup)

/** HonoX registers handlers as arrays (`createRoute` returns `createHandlers`). */
type Mounter = {
  get(path: string, ...handlers: never[]): unknown
  post(path: string, ...handlers: never[]): unknown
}

function mount(app: Hono, method: 'get' | 'post', path: string, route: unknown) {
  const handlers = (Array.isArray(route) ? route : [route]) as never[]
  const target = app as unknown as Mounter
  if (method === 'get') target.get(path, ...handlers)
  else target.post(path, ...handlers)
}

async function harness() {
  const page = (await import('../../app/routes/career-data/index')).default
  const directions = (await import('../../app/routes/career-data/directions/index')).default
  const directionForm = await import('../../app/routes/career-data/directions/form')
  const directionEdit = await import('../../app/routes/career-data/directions/[key]/form')
  const directionRetire = await import('../../app/routes/career-data/directions/[key]/retire')
  const baseResumes = (await import('../../app/routes/career-data/base-resumes/index')).default
  const baseResumeForm = await import('../../app/routes/career-data/base-resumes/form')
  const baseResumePreview = await import('../../app/routes/career-data/base-resumes/[id]/preview')
  const baseResumeApprove = await import('../../app/routes/career-data/base-resumes/[id]/approve')
  const baseResumeSupersede = await import(
    '../../app/routes/career-data/base-resumes/[id]/supersede'
  )

  const app = new Hono()
  mount(app, 'get', '/career-data', page)
  mount(app, 'get', '/career-data/directions', directions)
  mount(app, 'get', '/career-data/directions/form', directionForm.GET)
  mount(app, 'post', '/career-data/directions/form', directionForm.POST)
  mount(app, 'get', '/career-data/directions/:key/form', directionEdit.GET)
  mount(app, 'post', '/career-data/directions/:key/form', directionEdit.POST)
  mount(app, 'post', '/career-data/directions/:key/retire', directionRetire.POST)
  mount(app, 'get', '/career-data/base-resumes', baseResumes)
  mount(app, 'get', '/career-data/base-resumes/form', baseResumeForm.GET)
  mount(app, 'post', '/career-data/base-resumes/form', baseResumeForm.POST)
  mount(app, 'get', '/career-data/base-resumes/:id/preview', baseResumePreview.GET)
  mount(app, 'post', '/career-data/base-resumes/:id/approve', baseResumeApprove.POST)
  mount(app, 'post', '/career-data/base-resumes/:id/supersede', baseResumeSupersede.POST)
  return app
}

const formHeaders = { 'content-type': 'application/x-www-form-urlencoded' } as const

function post(app: Hono, path: string, entries: Array<[string, string]> = []) {
  return app.request(path, {
    body: new URLSearchParams(entries),
    headers: formHeaders,
    method: 'POST',
  })
}

function directionEntries(overrides: Record<string, string> = {}): Array<[string, string]> {
  return Object.entries({
    label: `${marker} Full-stack`,
    targetTitles: 'Full-Stack Developer\nSenior Developer',
    sortOrder: '4',
    maxWords: '600',
    maxBullets: '24',
    summaryMaxWords: '70',
    sectionWordBudgets: 'skills = 120',
    expectedRevision: '0',
    ...overrides,
  })
}

describe('career data step 10 page and fragment boundaries', () => {
  test('each new full page renders the AppShell once with the active tab', async () => {
    const app = await harness()
    for (const tab of ['directions', 'base-resumes']) {
      const response = await app.request(`/career-data/${tab}`)
      const html = await response.text()
      expect(response.status).toBe(200)
      expect(html).toContain('id="app-nav-toggle"')
      expect(html).toContain('aria-label="Primary navigation"')
      expect(recordsFor(html, 'career-data-section')).toHaveLength(1)
      expect(recordsFor(html, 'career-data-tabs')).toHaveLength(1)
      const active = html.match(new RegExp(`<a[^>]*id="career-data-tab-${tab}"[^>]*>`))?.[0]
      expect(active).toContain('aria-current="page"')
    }
  })

  test('each new section fragment never renders the AppShell and refreshes tabs OOB', async () => {
    const app = await harness()
    for (const tab of ['directions', 'base-resumes']) {
      const response = await app.request(`/career-data/${tab}`, {
        headers: { 'HX-Request': 'true' },
      })
      const html = await response.text()
      expect(response.status).toBe(200)
      expect(html).not.toContain('app-nav-toggle')
      expect(html).not.toContain('Primary navigation')
      expect(recordsFor(html, 'career-data-section')).toEqual([
        expect.objectContaining({ depth: 0, oob: undefined }),
      ])
      expect(recordsFor(html, 'career-data-tabs')).toEqual([
        expect.objectContaining({ depth: 0, oob: 'outerHTML' }),
      ])
      expect(recordsFor(html, `career-data-${tab}-panel`)).toHaveLength(1)
    }
  })
})

describe('direction form', () => {
  test('create persists key, target titles, order and bounded rules without raw JSON', async () => {
    const app = await harness()
    const response = await post(app, '/career-data/directions/form', directionEntries())
    const html = await response.text()
    expect(response.status).toBe(200)

    const record = markerDirections().find((row) => row.label === `${marker} Full-stack`)
    expect(record?.key).toBe('career-ui10-full-stack')
    expect(record?.targetTitles).toEqual(['Full-Stack Developer', 'Senior Developer'])
    expect(record?.sortOrder).toBe(4)
    expect(record?.rules).toMatchObject({
      maxWords: 600,
      maxBullets: 24,
      summaryMaxWords: 70,
      sectionWordBudgets: { skills: 120 },
    })
    expect(recordsFor(html, `career-directions-${record?.key}-form`)).toEqual([
      expect.objectContaining({ depth: 0, oob: undefined }),
    ])
    expect(recordsFor(html, 'career-directions-list')).toEqual([
      expect.objectContaining({ depth: 0, oob: 'outerHTML' }),
    ])
    expect(recordsFor(html, 'career-data-tabs')).toEqual([
      expect.objectContaining({ depth: 0, oob: 'outerHTML' }),
    ])
    expect(html).not.toContain('onclick=')
    expect(html).not.toContain('<script')

    // Reloading the edit form keeps the stable key and every ordinary control.
    const edit = await (await app.request(`/career-data/directions/${record?.key}/form`)).text()
    expect(edit).toContain(record?.key ?? '')
    expect(edit).toContain('Full-Stack Developer')
    expect(edit).toContain('value="600"')
    expect(edit).toContain('skills = 120')
    expect(edit).not.toContain('"maxWords":')

    // Renaming preserves the stable key so external references stay valid.
    const renamed = await post(
      app,
      `/career-data/directions/${record?.key}/form`,
      directionEntries({
        label: `${marker} Renamed`,
        expectedRevision: String(record?.revision ?? 1),
      }),
    )
    expect(renamed.status).toBe(200)
    expect(markerDirections().find((row) => row.key === record?.key)?.label).toBe(
      `${marker} Renamed`,
    )
  })

  test('a validation failure is a 422 that returns only the smallest form', async () => {
    const app = await harness()
    const response = await post(app, '/career-data/directions/form', [
      ['label', ''],
      ['targetTitles', ''],
      ['maxWords', '0'],
      ['sectionWordBudgets', 'skills = nope'],
      ['expectedRevision', '0'],
    ])
    const html = await response.text()
    expect(response.status).toBe(422)
    expect(response.headers.get('HX-Retarget')).toBe('#career-directions-form')
    expect(recordsFor(html, 'career-directions-form')).toEqual([
      expect.objectContaining({ depth: 0, oob: undefined }),
    ])
    expect(recordsFor(html, 'career-data-section')).toHaveLength(0)
    expect(html).toContain('Direction label is required.')
    expect(html).toContain('Add at least one target title.')
    expect(html).toContain('Maximum words must be at least 1.')
    expect(html).toContain('section = words')
    expect(markerDirections()).toHaveLength(0)
  })

  test('a stale direction submit is a 409 form fragment and writes nothing', async () => {
    seedDirection()
    const app = await harness()
    const response = await post(
      app,
      `/career-data/directions/${keyPrefix}-fullstack/form`,
      directionEntries({ label: 'Stale direction', expectedRevision: '999999' }),
    )
    const html = await response.text()
    expect(response.status).toBe(409)
    expect(response.headers.get('HX-Retarget')).toBe(
      `#career-directions-${keyPrefix}-fullstack-form`,
    )
    expect(recordsFor(html, `career-directions-${keyPrefix}-fullstack-form`)).toEqual([
      expect.objectContaining({ depth: 0, oob: undefined }),
    ])
    expect(html).toContain('This record changed since you opened it')
    expect(markerDirections().find((row) => row.key === `${keyPrefix}-fullstack`)?.label).toBe(
      `${marker} Full-stack`,
    )
  })

  test('re-saving identical direction content is a no-op that does not bump the revision', async () => {
    const app = await harness()
    await post(app, '/career-data/directions/form', directionEntries())
    const created = markerDirections().find((row) => row.key === `${keyPrefix}-full-stack`)
    expect(created?.revision).toBe(1)

    const noop = await post(
      app,
      `/career-data/directions/${created?.key}/form`,
      directionEntries({ expectedRevision: String(created?.revision ?? 1) }),
    )
    expect(noop.status).toBe(200)
    expect(markerDirections().find((row) => row.key === created?.key)?.revision).toBe(
      created?.revision,
    )
  })

  test('retire and restore return the list fragment only and preserve history', async () => {
    seedDirection()
    const app = await harness()
    const key = `${keyPrefix}-fullstack`

    const retired = await post(app, `/career-data/directions/${key}/retire?showRetired=1`, [
      ['action', 'retire'],
    ])
    const retiredHtml = await retired.text()
    expect(recordsFor(retiredHtml, 'career-directions-list')).toEqual([
      expect.objectContaining({ depth: 0, oob: undefined }),
    ])
    expect(recordsFor(retiredHtml, 'career-data-section')).toHaveLength(0)
    expect(recordsFor(retiredHtml, 'career-data-tabs')).toHaveLength(0)
    expect(retiredHtml).toContain('Retired')
    expect(retiredHtml).toContain('Restore')
    expect(markerDirections().find((row) => row.key === key)?.retiredAt).not.toBeNull()

    const restored = await post(app, `/career-data/directions/${key}/retire?showRetired=1`, [
      ['action', 'restore'],
    ])
    expect(await restored.text()).toContain('>Retire<')
    expect(markerDirections().find((row) => row.key === key)?.retiredAt).toBeNull()
    expect(markerDirections().find((row) => row.key === key)?.label).toBe(`${marker} Full-stack`)
  })
})

describe('base resume versions', () => {
  test('a draft is snapshotted by hash, previewed read-only and approved as selected', async () => {
    const key = seedDirection()
    const app = await harness()
    const created = await post(app, '/career-data/base-resumes/form', [
      ['directionKey', key],
      ['version', 'v1'],
      ['markdown', markdownV1],
    ])
    const createdHtml = await created.text()
    expect(created.status).toBe(200)
    expect(recordsFor(createdHtml, 'career-base-resumes-form')).toEqual([
      expect.objectContaining({ depth: 0, oob: undefined }),
    ])
    expect(recordsFor(createdHtml, 'career-base-resumes-list')).toEqual([
      expect.objectContaining({ depth: 0, oob: 'outerHTML' }),
    ])
    expect(recordsFor(createdHtml, 'career-data-tabs')).toEqual([
      expect.objectContaining({ depth: 0, oob: 'outerHTML' }),
    ])
    expect(createdHtml).toContain('No approved version — generation disabled')

    const v1 = markerBaseResumes().find((row) => row.version === 'v1')
    expect(v1?.status).toBe('draft')
    expect(v1?.contentHash).toBe(baseResumeTextHash(markdownV1))
    expect(selectedApprovedBaseResume(db, key)).toBeNull()

    const preview = await app.request(`/career-data/base-resumes/${v1?.id}/preview`)
    const previewHtml = await preview.text()
    expect(preview.status).toBe(200)
    expect(recordsFor(previewHtml, 'career-base-resumes-preview')).toEqual([
      expect.objectContaining({ depth: 0, oob: undefined }),
    ])
    expect(previewHtml).toContain('Read-only')
    expect(previewHtml).toContain('Synthetic step 10 draft.')
    expect(previewHtml).not.toContain('app-nav-toggle')

    const approved = await post(app, `/career-data/base-resumes/${v1?.id}/approve`)
    const approvedHtml = await approved.text()
    expect(approved.status).toBe(200)
    expect(recordsFor(approvedHtml, 'career-base-resumes-list')).toEqual([
      expect.objectContaining({ depth: 0, oob: undefined }),
    ])
    expect(recordsFor(approvedHtml, 'career-data-tabs')).toHaveLength(0)
    expect(approvedHtml).toContain('Selected: version v1')
    expect(selectedApprovedBaseResume(db, key)?.id).toBe(v1?.id)
  })

  test('approving a replacement supersedes the previous version in one transaction', async () => {
    const key = seedDirection()
    const app = await harness()
    await post(app, '/career-data/base-resumes/form', [
      ['directionKey', key],
      ['version', 'v1'],
      ['markdown', markdownV1],
    ])
    const v1 = markerBaseResumes().find((row) => row.version === 'v1')
    await post(app, `/career-data/base-resumes/${v1?.id}/approve`)

    await post(app, '/career-data/base-resumes/form', [
      ['directionKey', key],
      ['version', 'v2'],
      ['markdown', markdownV2],
    ])
    const v2 = markerBaseResumes().find((row) => row.version === 'v2')
    // The previous approval stays selected until the explicit replacement.
    expect(selectedApprovedBaseResume(db, key)?.id).toBe(v1?.id)

    const approved = await post(app, `/career-data/base-resumes/${v2?.id}/approve`)
    expect(await approved.text()).toContain('Selected: version v2')
    expect(selectedApprovedBaseResume(db, key)?.id).toBe(v2?.id)
    const previous = markerBaseResumes().find((row) => row.id === v1?.id)
    expect(previous?.status).toBe('superseded')
    // The historical version's Markdown and hash are untouched.
    expect(previous?.markdown).toBe(markdownV1)
    expect(previous?.contentHash).toBe(baseResumeTextHash(markdownV1))
  })

  test('editing an existing version label is refused with an immutability 422', async () => {
    const key = seedDirection()
    const app = await harness()
    await post(app, '/career-data/base-resumes/form', [
      ['directionKey', key],
      ['version', 'v1'],
      ['markdown', markdownV1],
    ])

    const duplicate = await post(app, '/career-data/base-resumes/form', [
      ['directionKey', key],
      ['version', 'v1'],
      ['markdown', '# A different history\n'],
    ])
    const html = await duplicate.text()
    expect(duplicate.status).toBe(422)
    expect(duplicate.headers.get('HX-Retarget')).toBe('#career-base-resumes-form')
    expect(recordsFor(html, 'career-base-resumes-form')).toEqual([
      expect.objectContaining({ depth: 0, oob: undefined }),
    ])
    expect(recordsFor(html, 'career-data-section')).toHaveLength(0)
    expect(html).toContain('immutable')
    expect(markerBaseResumes().find((row) => row.version === 'v1')?.markdown).toBe(markdownV1)

    const empty = await post(app, '/career-data/base-resumes/form', [
      ['directionKey', key],
      ['version', 'v-empty'],
      ['markdown', '   '],
    ])
    expect(empty.status).toBe(422)
    expect(await empty.text()).toContain('Enter the Base Resume Markdown.')
    expect(markerBaseResumes().some((row) => row.version === 'v-empty')).toBe(false)
  })

  test('superseding clears the selected version and keeps the history readable', async () => {
    const key = seedDirection()
    const app = await harness()
    await post(app, '/career-data/base-resumes/form', [
      ['directionKey', key],
      ['version', 'v1'],
      ['markdown', markdownV1],
    ])
    const v1 = markerBaseResumes().find((row) => row.version === 'v1')
    await post(app, `/career-data/base-resumes/${v1?.id}/approve`)

    const superseded = await post(app, `/career-data/base-resumes/${v1?.id}/supersede`)
    const html = await superseded.text()
    expect(recordsFor(html, 'career-base-resumes-list')).toEqual([
      expect.objectContaining({ depth: 0, oob: undefined }),
    ])
    expect(selectedApprovedBaseResume(db, key)).toBeNull()
    expect(html).toContain('No approved version — generation disabled')
    expect(markerBaseResumes().find((row) => row.id === v1?.id)?.markdown).toBe(markdownV1)
  })
})
