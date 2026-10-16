import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Hono } from 'hono'
import { CareerDataPage } from '../../app/components/career/CareerDataPage'
import { AppNavigation, resolveActiveNavPath } from '../../app/components/layout/AppNavigation'
import { loadCareerDataView } from '../../src/db/career-data-view'
import { saveCareerCandidate } from '../../src/db/career-facts'
import {
  createCareerEducation,
  listCareerEducation,
  listCareerExperiences,
} from '../../src/db/career-records'
import { db, sqlite } from '../../src/db/client'
import { careerOnboardingGuidance } from '../../src/lib/applications/readiness'
import {
  saveRecordExtensions,
  storedRecordExtensions,
  writeRecordExtensions,
} from '../../src/lib/career/extensions'
import { createCareerTestDatabase } from '../support/career-db'
import { recordsFor, renderJsx } from './support/html-contract'

/**
 * route acceptance for `/career-data`.
 *
 * Everything here runs against the suite's isolated database (`DB_FILE_NAME`,
 * created outside the repository by the preload): the routes resolve the real
 * `db` singleton, so the acceptance criteria are proved end to end through the
 * repositories. Fixture rows use an explicit `__career-ui` marker and are
 * removed before and after every test; the developer's `jobs.db` is never
 * opened, and no identity row is ever written.
 */

const marker = '__career-ui'

function uiExperiences() {
  return listCareerExperiences(db, { includeRetired: true }).filter((row) =>
    row.company.startsWith(marker),
  )
}

function uiEducation() {
  return listCareerEducation(db, { includeRetired: true }).filter((row) =>
    row.school.startsWith(marker),
  )
}

function cleanup() {
  const education = uiEducation()
  // Clearing an extension needs the owning row, so clear before deleting rows.
  for (const row of education) saveRecordExtensions(db, 'education', row.stableKey, '')
  for (const row of uiExperiences()) {
    sqlite.query('DELETE FROM career_experiences WHERE id = ?').run(row.id)
  }
  for (const row of education) {
    sqlite.query('DELETE FROM career_education WHERE id = ?').run(row.id)
  }
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
  const identity = (await import('../../app/routes/career-data/identity/index')).default
  const identityForm = await import('../../app/routes/career-data/identity/form')
  const experience = (await import('../../app/routes/career-data/experience/index')).default
  const experienceForm = await import('../../app/routes/career-data/experience/form')
  const experienceEdit = await import('../../app/routes/career-data/experience/[id]/form')
  const experienceRetire = await import('../../app/routes/career-data/experience/[id]/retire')
  const experienceOrder = await import('../../app/routes/career-data/experience/[id]/order')
  const education = (await import('../../app/routes/career-data/education/index')).default
  const educationForm = await import('../../app/routes/career-data/education/form')
  const educationEdit = await import('../../app/routes/career-data/education/[id]/form')
  const educationRetire = await import('../../app/routes/career-data/education/[id]/retire')

  const app = new Hono()
  mount(app, 'get', '/career-data', page)
  mount(app, 'get', '/career-data/identity', identity)
  mount(app, 'get', '/career-data/identity/form', identityForm.GET)
  mount(app, 'post', '/career-data/identity/form', identityForm.POST)
  mount(app, 'get', '/career-data/experience', experience)
  mount(app, 'get', '/career-data/experience/form', experienceForm.GET)
  mount(app, 'post', '/career-data/experience/form', experienceForm.POST)
  mount(app, 'get', '/career-data/experience/:id/form', experienceEdit.GET)
  mount(app, 'post', '/career-data/experience/:id/form', experienceEdit.POST)
  mount(app, 'post', '/career-data/experience/:id/retire', experienceRetire.POST)
  mount(app, 'post', '/career-data/experience/:id/order', experienceOrder.POST)
  mount(app, 'get', '/career-data/education', education)
  mount(app, 'get', '/career-data/education/form', educationForm.GET)
  mount(app, 'post', '/career-data/education/form', educationForm.POST)
  mount(app, 'get', '/career-data/education/:id/form', educationEdit.GET)
  mount(app, 'post', '/career-data/education/:id/form', educationEdit.POST)
  mount(app, 'post', '/career-data/education/:id/retire', educationRetire.POST)
  return app
}

const formHeaders = { 'content-type': 'application/x-www-form-urlencoded' } as const

function post(
  app: Hono,
  path: string,
  body: Record<string, string>,
  headers: Record<string, string> = {},
) {
  return app.request(path, {
    body: new URLSearchParams(body),
    headers: { ...formHeaders, ...headers },
    method: 'POST',
  })
}

async function createExperience(overrides: Record<string, string> = {}) {
  const app = await harness()
  const response = await post(app, '/career-data/experience/form', {
    company: `${marker} Northwind`,
    role: 'Senior Developer',
    employmentNature: 'full-time',
    startDate: '2021-03',
    datePrecision: 'month',
    displayDates: 'Mar 2021 - Present',
    sortOrder: '1',
    context: 'Reporting team.',
    responsibilities: 'Owned the API\nReviewed changes',
    extensionFields: 'importSource = legacy',
    expectedRevision: '0',
    ...overrides,
  })
  const record = uiExperiences().find(
    (row) => row.company === (overrides.company ?? `${marker} Northwind`),
  )
  return { app, response, html: await response.text(), record }
}

describe('career data page and fragment boundaries', () => {
  test('the sidebar has one Career data item that stays active inside the section', async () => {
    const html = await renderJsx(<AppNavigation currentPath="/career-data/experience" />)
    expect(html).toContain('href="/career-data"')
    expect(html).toContain('Career data')
    expect(html).toContain('menu-active')
    expect(resolveActiveNavPath('/career-data')).toBe('/career-data')
    expect(resolveActiveNavPath('/career-data/experience')).toBe('/career-data')
    expect(resolveActiveNavPath('/career-data/education')).toBe('/career-data')
  })

  test('the full page renders the AppShell once and marks the active tab', async () => {
    const response = await (await harness()).request('/career-data')
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(html).toContain('id="app-nav-toggle"')
    expect(html).toContain('aria-label="Primary navigation"')
    expect(html).toContain('Career data')
    expect(recordsFor(html, 'career-data-section')).toHaveLength(1)
    expect(recordsFor(html, 'career-data-tabs')).toHaveLength(1)
    expect(recordsFor(html, 'career-data-tabs')[0]?.oob).toBeUndefined()
    expect(html.match(/<a[^>]*id="career-data-tab-identity"[^>]*>/)?.[0]).toContain(
      'aria-current="page"',
    )
  })

  test('a section fragment never renders the AppShell and refreshes the tabs out of band', async () => {
    const response = await (await harness()).request('/career-data/experience', {
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
    expect(recordsFor(html, 'career-data-experience-panel')).toHaveLength(1)
    expect(recordsFor(html, 'career-data-identity-panel')).toHaveLength(0)
    const tab = html.match(/<a[^>]*id="career-data-tab-experience"[^>]*>/)?.[0]
    expect(tab).toContain('aria-current="page"')
    expect(tab).toContain('href="/career-data/experience"')
  })

  test('retired records stay hidden until the filter is on, and the filter survives the swap', async () => {
    const { record } = await createExperience()
    await (await harness()).request(`/career-data/experience/${record?.id}/retire`, {
      body: new URLSearchParams({ action: 'retire' }),
      headers: formHeaders,
      method: 'POST',
    })

    const hidden = await (await harness()).request('/career-data/education?showRetired=1', {
      headers: { 'HX-Request': 'true' },
    })
    expect(hidden.status).toBe(200)
    expect((await hidden.text()).match(/name="showRetired"[^>]*/)?.[0]).toContain('checked')

    const shown = await (await harness()).request('/career-data/experience?showRetired=1', {
      headers: { 'HX-Request': 'true' },
    })
    const html = await shown.text()
    expect(html).toContain(marker)
    expect(html).toContain('Retired')
    expect(html).toContain('Restore')
  })
})

describe('visible onboarding empty state', () => {
  test('an empty database shows the guidance, and it disappears once facts exist', async () => {
    const empty = createCareerTestDatabase({ seed: false })
    try {
      const before = await renderJsx(
        <CareerDataPage
          activeTab="identity"
          includeRetired={false}
          view={loadCareerDataView(empty.executor)}
        />,
      )
      expect(before).toContain(careerOnboardingGuidance)
      expect(recordsFor(before, 'career-onboarding-notice')).toHaveLength(1)
      expect(before).toContain('No identity recorded yet')

      saveCareerCandidate(empty.executor, { fullName: 'Fixture Candidate' })
      const after = await renderJsx(
        <CareerDataPage
          activeTab="identity"
          includeRetired={false}
          view={loadCareerDataView(empty.executor)}
        />,
      )
      expect(after).not.toContain(careerOnboardingGuidance)
      expect(recordsFor(after, 'career-onboarding-notice')).toHaveLength(1)
    } finally {
      empty.cleanup()
    }
  })
})

describe('experience form fragments', () => {
  test('create persists every field, generates the stable key and returns main plus OOB siblings', async () => {
    const { response, html, record } = await createExperience()

    expect(response.status).toBe(200)
    expect(record?.stableKey).toBe('career-ui-northwind-senior-developer')
    expect(record?.responsibilities).toEqual(['Owned the API', 'Reviewed changes'])
    expect(record?.extension).toEqual({ importSource: 'legacy' })
    expect(record?.employmentNature).toBe('full-time')
    expect(record?.datePrecision).toBe('month')

    expect(recordsFor(html, `career-experience-${record?.id}-form`)).toEqual([
      expect.objectContaining({ depth: 0, oob: undefined }),
    ])
    expect(recordsFor(html, 'career-experience-list')).toEqual([
      expect.objectContaining({ depth: 0, oob: 'outerHTML' }),
    ])
    expect(recordsFor(html, 'career-data-tabs')).toEqual([
      expect.objectContaining({ depth: 0, oob: 'outerHTML' }),
    ])
    expect(recordsFor(html, 'flash')).toEqual([
      expect.objectContaining({ depth: 0, oob: 'innerHTML' }),
    ])
    expect(html).toContain(`${marker} Northwind`)
  })

  test('a reload persists edits and a rename keeps the stable key', async () => {
    const { app, record } = await createExperience()
    const id = record?.id

    const form = await (await app.request(`/career-data/experience/${id}/form`)).text()
    expect(form.match(/name="expectedRevision" value="(\d+)"/)?.[1]).toBe('1')
    expect(form).toContain(`id="career-experience-${id}-form"`)

    const update = await post(app, `/career-data/experience/${id}/form`, {
      company: `${marker} Renamed`,
      role: 'Staff Engineer',
      employmentNature: 'contract',
      startDate: '2021-03',
      datePrecision: 'month',
      responsibilities: 'One responsibility',
      extensionFields: 'importSource = legacy',
      expectedRevision: '1',
    })
    expect(update.status).toBe(200)

    const stored = uiExperiences().find((row) => row.id === id)
    expect(stored?.company).toBe(`${marker} Renamed`)
    expect(stored?.role).toBe('Staff Engineer')
    expect(stored?.stableKey).toBe(record?.stableKey)
    expect(stored?.revision).toBe(2)

    const reloaded = await (await app.request(`/career-data/experience/${id}/form`)).text()
    expect(reloaded).toContain(`value="${marker} Renamed"`)
    expect(reloaded).toContain('value="Staff Engineer"')
    expect(reloaded).toContain(record?.stableKey ?? '')
    expect(reloaded).toContain('name="expectedRevision" value="2"')
  })

  test('a stale form is a 409 fragment with a reload action and writes nothing', async () => {
    const { app, record } = await createExperience()
    const id = record?.id
    const rootId = `career-experience-${id}-form`

    const response = await post(app, `/career-data/experience/${id}/form`, {
      company: 'Stale Co',
      role: 'Stale Role',
      datePrecision: 'day',
      expectedRevision: '999999',
    })
    const html = await response.text()

    expect(response.status).toBe(409)
    expect(response.headers.get('HX-Retarget')).toBe(`#${rootId}`)
    expect(recordsFor(html, rootId)).toEqual([
      expect.objectContaining({ depth: 0, oob: undefined }),
    ])
    expect(recordsFor(html, 'career-data-section')).toHaveLength(0)
    expect(html).toContain('This record changed since you opened it')
    expect(html).toContain('Reload the current record')
    expect(html).toContain(`hx-get="/career-data/experience/${id}/form"`)
    expect(html).toContain('value="Stale Co"')
    expect(uiExperiences().find((row) => row.id === id)?.company).toBe(record?.company)

    const direct = await post(
      app,
      `/career-data/experience/${id}/form`,
      { company: 'Stale Co', role: 'Stale Role', expectedRevision: '999999' },
      { 'HX-Target': rootId },
    )
    expect(direct.status).toBe(409)
    expect(direct.headers.get('HX-Retarget')).toBeNull()
  })

  test('validation failure is a 422 that returns only the form with inline errors', async () => {
    const response = await post(await harness(), '/career-data/experience/form', {
      company: '',
      role: 'Engineer',
      startDate: '2021-03',
      datePrecision: 'day',
      expectedRevision: '0',
    })
    const html = await response.text()

    expect(response.status).toBe(422)
    expect(response.headers.get('HX-Retarget')).toBe('#career-experience-form')
    expect(recordsFor(html, 'career-experience-form')).toEqual([
      expect.objectContaining({ depth: 0, oob: undefined }),
    ])
    expect(recordsFor(html, 'career-data-section')).toHaveLength(0)
    expect(recordsFor(html, 'career-experience-list')).toHaveLength(0)
    expect(html).toContain('role="alert"')
    expect(html).toContain('aria-invalid="true"')
    expect(html).toContain('Company is required.')
    expect(html).toContain('Use YYYY-MM-DD (day precision).')
    expect(html).toContain('value="Engineer"')
    expect(uiExperiences()).toHaveLength(0)
  })

  test('retire/restore returns the list fragment only and preserves history', async () => {
    const { app, record } = await createExperience()
    const id = record?.id

    const retired = await post(app, `/career-data/experience/${id}/retire?showRetired=1`, {
      action: 'retire',
    })
    const html = await retired.text()
    expect(retired.status).toBe(200)
    expect(recordsFor(html, 'career-experience-list')).toEqual([
      expect.objectContaining({ depth: 0, oob: undefined }),
    ])
    expect(recordsFor(html, 'career-data-section')).toHaveLength(0)
    expect(recordsFor(html, 'career-data-tabs')).toHaveLength(0)
    expect(html).toContain('Retired')
    expect(html).toContain('Restore')
    // The restore control posts the section route and returns the list fragment.
    const restoreButton = html.match(/<button[^>]*>\s*Restore\s*<\/button>/)?.[0] ?? ''
    expect(restoreButton).toContain(`hx-post="/career-data/experience/${id}/retire?showRetired=1"`)
    expect(restoreButton).toContain('hx-vals=')
    expect(restoreButton).toContain('restore')
    expect(restoreButton).toContain('hx-target="#career-experience-list"')

    const stored = listCareerExperiences(db, { includeRetired: true }).find((row) => row.id === id)
    expect(stored?.retiredAt).not.toBeNull()
    expect(stored?.responsibilities).toEqual(['Owned the API', 'Reviewed changes'])
    expect(listCareerExperiences(db).find((row) => row.id === id)).toBeUndefined()

    const restored = await post(app, `/career-data/experience/${id}/retire?showRetired=1`, {
      action: 'restore',
    })
    const restoredHtml = await restored.text()
    expect(restoredHtml).toContain('>Retire<')
    expect(
      listCareerExperiences(db, { includeRetired: true }).find((row) => row.id === id)?.retiredAt,
    ).toBeNull()
  })

  test('move up reorders the list fragment', async () => {
    const first = await createExperience({ company: `${marker} First`, role: 'Engineer' })
    const second = await createExperience({ company: `${marker} Second`, role: 'Engineer' })

    const response = await post(first.app, `/career-data/experience/${second.record?.id}/order`, {
      direction: 'up',
    })
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(recordsFor(html, 'career-experience-list')).toEqual([
      expect.objectContaining({ depth: 0, oob: undefined }),
    ])
    const firstKey = first.record?.stableKey ?? ''
    const secondKey = second.record?.stableKey ?? ''
    expect(secondKey).not.toBe('')
    expect(uiExperiences().map((row) => row.stableKey)).toEqual([secondKey, firstKey])
    expect(html.indexOf(`${marker} Second`)).toBeLessThan(html.indexOf(`${marker} First`))
  })
})

describe('education form fragments', () => {
  test('create persists coursework, details, extension fields and a generated key', async () => {
    const app = await harness()
    const response = await post(app, '/career-data/education/form', {
      degree: 'Certificate',
      school: `${marker} Training`,
      datePrecision: 'year',
      year: '2023',
      coursework: 'Algorithms\nData structures',
      details: 'Evening program.',
      extensionFields: 'preserved = yes',
      expectedRevision: '0',
    })
    const html = await response.text()

    expect(response.status).toBe(200)
    const record = uiEducation().find((row) => row.school === `${marker} Training`)
    expect(record?.stableKey).toBe('career-ui-training-certificate')
    expect(record?.coursework).toEqual(['Algorithms', 'Data structures'])
    expect(record?.details).toBe('Evening program.')
    expect(record?.year).toBe(2023)
    expect(storedRecordExtensions(db, 'education', record?.stableKey ?? '')).toEqual({
      preserved: 'yes',
    })
    expect(recordsFor(html, `career-education-${record?.id}-form`)).toEqual([
      expect.objectContaining({ depth: 0, oob: undefined }),
    ])
    expect(recordsFor(html, 'career-education-list')).toEqual([
      expect.objectContaining({ depth: 0, oob: 'outerHTML' }),
    ])

    const retired = await post(app, `/career-data/education/${record?.id}/retire?showRetired=1`, {
      action: 'retire',
    })
    expect(retired.status).toBe(200)
    expect(uiEducation().find((row) => row.id === record?.id)?.retiredAt).not.toBeNull()
    expect(listCareerEducation(db).find((row) => row.id === record?.id)).toBeUndefined()
  })

  function createEducation(details: unknown = null) {
    const created = createCareerEducation(db, {
      stableKey: `${marker}-institute-bsc`,
      degree: 'BSc Computer Science',
      school: `${marker} Institute`,
      startDate: '2016-09',
      datePrecision: 'month',
      coursework: ['Databases'],
      details,
    })
    const record = listCareerEducation(db, { includeRetired: true }).find(
      (row) => row.id === created.id,
    )
    if (!record) throw new Error('Fixture education record was not created.')
    return record
  }

  test('preserved details and extension fields stay editable without raw JSON', async () => {
    const app = await harness()
    const record = createEducation({ note: 'preserved' })
    // Seeded as an object so the JSON number type is preserved by the form's
    // `key = value` round trip, exactly as the importer stores it.
    writeRecordExtensions(db, 'education', record.stableKey, { preserved: 7 })

    const form = await (await app.request(`/career-data/education/${record.id}/form`)).text()
    expect(form).toContain('preserved = 7')
    // A preserved structured detail is shown as JSON text so it stays editable.
    expect(form).toContain('&quot;note&quot;:&quot;preserved&quot;')
    expect(form).toContain('name="coursework"')
    expect(form).toContain('Databases')

    const response = await post(app, `/career-data/education/${record.id}/form`, {
      degree: 'BSc Computer Science',
      school: `${marker} Institute`,
      datePrecision: 'month',
      startDate: '2016-09',
      coursework: 'Databases',
      details: '{"note":"preserved"}',
      extensionFields: 'preserved = 7',
      expectedRevision: String(record.revision),
    })
    expect(response.status).toBe(200)

    // Untouched values keep their stored JSON shape; editing a line stores text.
    const updated = listCareerEducation(db, { includeRetired: true }).find(
      (row) => row.id === record.id,
    )
    expect(updated?.details).toEqual({ note: 'preserved' })
    expect(storedRecordExtensions(db, 'education', record.stableKey)).toEqual({
      preserved: 7,
    })

    const removed = await post(app, `/career-data/education/${record.id}/form`, {
      degree: 'BSc Computer Science',
      school: `${marker} Institute`,
      datePrecision: 'month',
      details: '{"note":"preserved"}',
      extensionFields: '',
      expectedRevision: String(updated?.revision),
    })
    expect(removed.status).toBe(200)
    expect(storedRecordExtensions(db, 'education', record.stableKey)).toBeNull()
  })
})

describe('identity form fragments', () => {
  test('the singleton form carries its revision and a stale submit is a 409 form fragment', async () => {
    const app = await harness()
    const form = await (await app.request('/career-data/identity/form')).text()
    expect(form).toContain('id="career-identity-candidate-form"')
    expect(form).toContain('name="expectedRevision"')
    expect(form).toContain('name="workAuthorization"')
    expect(form).toContain('name="hasCareerBreak"')
    expect(form).toContain('name="neverClaimUnexperiencedSkill"')
    expect(form).toContain('name="extensionFields"')

    const response = await post(app, '/career-data/identity/form', {
      fullName: 'Stale Identity',
      expectedRevision: '999999',
    })
    const html = await response.text()
    expect(response.status).toBe(409)
    expect(response.headers.get('HX-Retarget')).toBe('#career-identity-candidate-form')
    expect(recordsFor(html, 'career-identity-candidate-form')).toEqual([
      expect.objectContaining({ depth: 0, oob: undefined }),
    ])
    expect(recordsFor(html, 'career-data-section')).toHaveLength(0)
    expect(html).toContain('This record changed since you opened it')
    expect(html).toContain('value="Stale Identity"')
  })
})

describe('stale revision fragment policy', () => {
  test('the renderer swaps a 409 fragment instead of falling back to an error', () => {
    const renderer = readFileSync(resolve(process.cwd(), 'app/client.ts'), 'utf8')
    expect(renderer).toMatch(/code: '409', swap: true/)
    expect(renderer).toMatch(/code: '422', swap: true/)
  })
})
