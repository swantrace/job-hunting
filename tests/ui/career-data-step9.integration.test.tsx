import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { createCareerDirection } from '../../src/db/career-directions'
import { readCareerPreferences } from '../../src/db/career-facts'
import {
  createCareerExperience,
  createCareerProject,
  listCareerPortfolioTopics,
  listCareerPublications,
  listCareerStories,
  retireCareerExperience,
  retireCareerProject,
} from '../../src/db/career-records'
import { readCareerStateDocuments, writeCareerStateDocuments } from '../../src/db/career-state'
import { db, sqlite } from '../../src/db/client'
import { applyExtensionFields } from '../../src/lib/career/form-input'
import { documentSafeCareerData, loadCareerDataFromDatabase } from '../../src/lib/career-data'
import { recordsFor } from './support/html-contract'

/**
 * Step 9 route acceptance for the stories, publications, portfolio and
 * preferences tabs.
 *
 * Every route resolves the real `db` singleton, so the acceptance criteria are
 * proved end to end through the Step 2 repositories. Fixture rows use the
 * `career-ui9` marker and are removed before and after every test; the
 * developer's `jobs.db` is never opened, and the preferences singleton is the
 * only shared row this suite writes.
 */

const marker = '__career-ui9'
const keyPrefix = 'career-ui9'

function seedDirection(key = `${keyPrefix}-fullstack`) {
  createCareerDirection(db, {
    key,
    label: 'Full-Stack Developer',
    targetTitles: ['Full-Stack Developer'],
  })
  return key
}

function seedExperience(stableKey = `${keyPrefix}-experience`) {
  return createCareerExperience(db, {
    stableKey,
    company: `${marker} Northwind`,
    role: 'Senior Developer',
  })
}

function seedProject(stableKey = `${keyPrefix}-project`) {
  return createCareerProject(db, { stableKey, name: `${marker} Synthetic project` })
}

function markerStories() {
  return listCareerStories(db, { includeRetired: true }).filter((row) =>
    row.stableKey.startsWith(keyPrefix),
  )
}

function markerPublications() {
  return listCareerPublications(db, { includeRetired: true }).filter((row) =>
    row.stableKey.startsWith(keyPrefix),
  )
}

function markerTopics() {
  return listCareerPortfolioTopics(db, { includeRetired: true }).filter((row) =>
    row.stableKey.startsWith(keyPrefix),
  )
}

function clearExtensions() {
  let records = readCareerStateDocuments(db).records
  for (const kind of ['stories', 'publications', 'portfolioTopics']) {
    for (const key of Object.keys(records[kind] ?? {})) {
      if (key.startsWith(keyPrefix)) records = applyExtensionFields(records, kind, key, null)
    }
  }
  writeCareerStateDocuments(db, { records })
}

function cleanup() {
  clearExtensions()
  sqlite.query(`DELETE FROM career_stories WHERE stable_key LIKE '${keyPrefix}%'`).run()
  sqlite.query(`DELETE FROM career_publications WHERE stable_key LIKE '${keyPrefix}%'`).run()
  sqlite.query(`DELETE FROM career_portfolio_topics WHERE stable_key LIKE '${keyPrefix}%'`).run()
  sqlite.query(`DELETE FROM career_projects WHERE stable_key LIKE '${keyPrefix}%'`).run()
  sqlite.query(`DELETE FROM career_experiences WHERE stable_key LIKE '${keyPrefix}%'`).run()
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
  const stories = (await import('../../app/routes/career-data/stories/index')).default
  const storyForm = await import('../../app/routes/career-data/stories/form')
  const storyEdit = await import('../../app/routes/career-data/stories/[id]/form')
  const storyRetire = await import('../../app/routes/career-data/stories/[id]/retire')
  const publications = (await import('../../app/routes/career-data/publications/index')).default
  const publicationForm = await import('../../app/routes/career-data/publications/form')
  const publicationEdit = await import('../../app/routes/career-data/publications/[id]/form')
  const publicationRetire = await import('../../app/routes/career-data/publications/[id]/retire')
  const publicationAuthors = await import('../../app/routes/career-data/publications/authors/order')
  const portfolio = (await import('../../app/routes/career-data/portfolio/index')).default
  const portfolioForm = await import('../../app/routes/career-data/portfolio/form')
  const portfolioEdit = await import('../../app/routes/career-data/portfolio/[id]/form')
  const portfolioRetire = await import('../../app/routes/career-data/portfolio/[id]/retire')
  const preferences = (await import('../../app/routes/career-data/preferences/index')).default
  const preferencesForm = await import('../../app/routes/career-data/preferences/form')

  const app = new Hono()
  mount(app, 'get', '/career-data', page)
  mount(app, 'get', '/career-data/stories', stories)
  mount(app, 'get', '/career-data/stories/form', storyForm.GET)
  mount(app, 'post', '/career-data/stories/form', storyForm.POST)
  mount(app, 'get', '/career-data/stories/:id/form', storyEdit.GET)
  mount(app, 'post', '/career-data/stories/:id/form', storyEdit.POST)
  mount(app, 'post', '/career-data/stories/:id/retire', storyRetire.POST)
  mount(app, 'get', '/career-data/publications', publications)
  mount(app, 'get', '/career-data/publications/form', publicationForm.GET)
  mount(app, 'post', '/career-data/publications/form', publicationForm.POST)
  mount(app, 'get', '/career-data/publications/:id/form', publicationEdit.GET)
  mount(app, 'post', '/career-data/publications/:id/form', publicationEdit.POST)
  mount(app, 'post', '/career-data/publications/:id/retire', publicationRetire.POST)
  mount(app, 'post', '/career-data/publications/authors/order', publicationAuthors.POST)
  mount(app, 'get', '/career-data/portfolio', portfolio)
  mount(app, 'get', '/career-data/portfolio/form', portfolioForm.GET)
  mount(app, 'post', '/career-data/portfolio/form', portfolioForm.POST)
  mount(app, 'get', '/career-data/portfolio/:id/form', portfolioEdit.GET)
  mount(app, 'post', '/career-data/portfolio/:id/form', portfolioEdit.POST)
  mount(app, 'post', '/career-data/portfolio/:id/retire', portfolioRetire.POST)
  mount(app, 'get', '/career-data/preferences', preferences)
  mount(app, 'get', '/career-data/preferences/form', preferencesForm.GET)
  mount(app, 'post', '/career-data/preferences/form', preferencesForm.POST)
  return app
}

const formHeaders = { 'content-type': 'application/x-www-form-urlencoded' } as const

function post(app: Hono, path: string, entries: Array<[string, string]>, headers = {}) {
  return app.request(path, {
    body: new URLSearchParams(entries),
    headers: { ...formHeaders, ...headers },
    method: 'POST',
  })
}

describe('career data step 9 page and fragment boundaries', () => {
  test('the tab registry gains stories, publications, portfolio and preferences', async () => {
    const { parseCareerDataTab, careerDataTabs } = await import(
      '../../app/components/career/CareerDataTabs'
    )
    expect(careerDataTabs.map((tab) => tab.key)).toEqual([
      'identity',
      'experience',
      'education',
      'achievements',
      'projects',
      'skills',
      'stories',
      'publications',
      'portfolio',
      'preferences',
    ])
    expect(parseCareerDataTab('portfolio')).toBe('portfolio')
    expect(parseCareerDataTab('forged')).toBe('identity')
  })

  test('each new full page renders the AppShell once with the active tab', async () => {
    const app = await harness()
    for (const tab of ['stories', 'publications', 'portfolio', 'preferences']) {
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
    for (const tab of ['stories', 'publications', 'portfolio', 'preferences']) {
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

describe('story form', () => {
  async function createStory(entries: Array<[string, string]> = []) {
    const app = await harness()
    const response = await post(app, '/career-data/stories/form', [
      ['title', `${marker} Reporting rescue`],
      ['context', 'Synthetic context.'],
      ['situation', 'Synthetic situation.'],
      ['task', 'Synthetic task.'],
      ['action', 'Synthetic action.'],
      ['result', 'Synthetic result.'],
      ['narrative', 'I rescued the synthetic reporting pipeline.'],
      ['expectedRevision', '0'],
      ...entries,
    ])
    const record = markerStories().find((row) => row.title.includes('Reporting rescue'))
    return { app, response, html: await response.text(), record }
  }

  test('create persists STAR text, the experience link, directions and extensions', async () => {
    const direction = seedDirection()
    const experience = seedExperience()
    const { response, html, record } = await createStory([
      ['experienceId', String(experience.id)],
      ['directions', direction],
      ['extensionFields', 'importSource = legacy stories.json'],
    ])

    expect(response.status).toBe(200)
    expect(record?.stableKey).toBe('career-ui9-reporting-rescue')
    expect(record?.situation).toBe('Synthetic situation.')
    expect(record?.narrative).toContain('synthetic reporting pipeline')
    expect(record?.experienceId).toBe(experience.id)
    expect(record?.directions).toEqual([direction])
    expect(recordsFor(html, `career-stories-${record?.id}-form`)).toEqual([
      expect.objectContaining({ depth: 0, oob: undefined }),
    ])
    expect(recordsFor(html, 'career-stories-list')).toEqual([
      expect.objectContaining({ depth: 0, oob: 'outerHTML' }),
    ])
    expect(recordsFor(html, 'career-data-tabs')).toEqual([
      expect.objectContaining({ depth: 0, oob: 'outerHTML' }),
    ])

    // The preserved extension field is editable as an ordinary key/value line.
    const app = await harness()
    const edit = await (await app.request(`/career-data/stories/${record?.id}/form`)).text()
    expect(edit).toContain('importSource = legacy stories.json')
    expect(edit).not.toContain('"importSource"')

    // A reload of the edit form keeps the stored values and stable key.
    expect(edit).toContain(record?.stableKey ?? '')
    expect(edit).toContain('Synthetic situation.')
    expect(edit).not.toContain('onclick=')
    expect(edit).not.toContain('<script')
  })

  test('a validation failure is a 422 that returns only the form', async () => {
    const app = await harness()
    const response = await post(app, '/career-data/stories/form', [
      ['title', ''],
      ['expectedRevision', '0'],
    ])
    const html = await response.text()
    expect(response.status).toBe(422)
    expect(response.headers.get('HX-Retarget')).toBe('#career-stories-form')
    expect(recordsFor(html, 'career-stories-form')).toEqual([
      expect.objectContaining({ depth: 0, oob: undefined }),
    ])
    expect(recordsFor(html, 'career-data-section')).toHaveLength(0)
    expect(html).toContain('aria-invalid="true"')
    expect(html).toContain('Story title is required.')
    expect(markerStories()).toHaveLength(0)
  })

  test('a retired experience is rejected at the trust boundary, not just hidden', async () => {
    const experience = seedExperience()
    retireCareerExperience(db, experience.id)
    const app = await harness()
    const response = await post(app, '/career-data/stories/form', [
      ['title', `${marker} Links a retired role`],
      ['experienceId', String(experience.id)],
      ['expectedRevision', '0'],
    ])
    const html = await response.text()
    expect(response.status).toBe(422)
    expect(html).toContain('retired')
    expect(
      markerStories().find((row) => row.title === `${marker} Links a retired role`),
    ).toBeUndefined()
  })

  test('a stale story submit is a 409 form fragment and writes nothing', async () => {
    const { app, record } = await createStory()
    const id = record?.id
    const response = await post(app, `/career-data/stories/${id}/form`, [
      ['title', 'Stale story'],
      ['expectedRevision', '999999'],
    ])
    const html = await response.text()
    expect(response.status).toBe(409)
    expect(response.headers.get('HX-Retarget')).toBe(`#career-stories-${id}-form`)
    expect(recordsFor(html, `career-stories-${id}-form`)).toEqual([
      expect.objectContaining({ depth: 0, oob: undefined }),
    ])
    expect(html).toContain('This record changed since you opened it')
    expect(listCareerStories(db).find((row) => row.id === id)?.title).toBe(record?.title)
  })

  test('retire and restore return the list fragment only and preserve history', async () => {
    const { app, record } = await createStory()
    const id = record?.id

    const retired = await post(app, `/career-data/stories/${id}/retire?showRetired=1`, [
      ['action', 'retire'],
    ])
    const retiredHtml = await retired.text()
    expect(recordsFor(retiredHtml, 'career-stories-list')).toEqual([
      expect.objectContaining({ depth: 0, oob: undefined }),
    ])
    expect(recordsFor(retiredHtml, 'career-data-section')).toHaveLength(0)
    expect(recordsFor(retiredHtml, 'career-data-tabs')).toHaveLength(0)
    expect(retiredHtml).toContain('Retired')
    expect(retiredHtml).toContain('Restore')

    const stored = markerStories().find((row) => row.id === id)
    expect(stored?.retiredAt).not.toBeNull()
    expect(stored?.narrative).toContain('synthetic reporting pipeline')

    const restored = await post(app, `/career-data/stories/${id}/retire?showRetired=1`, [
      ['action', 'restore'],
    ])
    expect(await restored.text()).toContain('>Retire<')
    expect(markerStories().find((row) => row.id === id)?.retiredAt).toBeNull()
  })
})

describe('publication form', () => {
  const authorFields: Array<[string, string]> = [
    ['authorName', 'Jordan Rivera'],
    ['authorCandidate', '0'],
    ['authorName', 'Alex Example'],
    ['authorName', ''],
  ]

  async function createPublication(entries: Array<[string, string]> = []) {
    const app = await harness()
    const response = await post(app, '/career-data/publications/form', [
      ['title', `${marker} Synthetic preprint`],
      ['citation', 'Rivera, J. (2026). Synthetic preprint. Example Journal.'],
      ['year', '2026'],
      ['status', 'preprint'],
      ['safeToUse', 'on'],
      ['contributions', 'Synthetic data analysis.'],
      ['sourceUrls', 'https://example.test/private-preprint'],
      ['expectedRevision', '0'],
      ...authorFields,
      ...entries,
    ])
    const record = markerPublications().find((row) => row.title.includes('Synthetic preprint'))
    return { app, response, html: await response.text(), record }
  }

  test('create persists ordered authors with one candidate and keeps private URLs stored', async () => {
    const direction = seedDirection()
    const project = seedProject()
    const { response, html, record } = await createPublication([
      ['directions', direction],
      ['projectIds', String(project.id)],
      ['authorListIsTruncated', 'on'],
    ])

    expect(response.status).toBe(200)
    expect(record?.stableKey).toBe('career-ui9-synthetic-preprint')
    expect(record?.authors).toEqual([
      { name: 'Jordan Rivera', isCandidate: true },
      { name: 'Alex Example', isCandidate: false },
    ])
    expect(record?.authorListTruncated).toBe(true)
    expect(record?.contributions).toEqual(['Synthetic data analysis.'])
    expect(record?.projectIds).toEqual([project.id])
    expect(record?.directions).toEqual([direction])
    expect(recordsFor(html, `career-publications-${record?.id}-form`)).toEqual([
      expect.objectContaining({ depth: 0, oob: undefined }),
    ])
    expect(recordsFor(html, 'career-publications-list')).toEqual([
      expect.objectContaining({ depth: 0, oob: 'outerHTML' }),
    ])

    // The stored record keeps the private URL; every generated context drops it.
    expect(record?.sourceUrls).toEqual(['https://example.test/private-preprint'])
    const safe = documentSafeCareerData(loadCareerDataFromDatabase(db))
    expect(safe.publications.find((item) => item.id === record?.stableKey)?.sourceUrls).toEqual([])
  })

  test('exactly one candidate author is required and a 422 reports it on the author field', async () => {
    const app = await harness()
    const missing = await post(app, '/career-data/publications/form', [
      ['title', `${marker} No candidate`],
      ['citation', 'Example, 2026.'],
      ['year', '2026'],
      ['status', 'needs-verification'],
      ['authorName', 'Alex Example'],
      ['authorName', ''],
      ['expectedRevision', '0'],
    ])
    const missingHtml = await missing.text()
    expect(missing.status).toBe(422)
    expect(missingHtml).toContain('Mark exactly one author as the candidate')
    expect(recordsFor(missingHtml, 'career-publications-form')).toEqual([
      expect.objectContaining({ depth: 0, oob: undefined }),
    ])
    expect(
      markerPublications().find((row) => row.title === `${marker} No candidate`),
    ).toBeUndefined()

    const twoCandidates = await post(app, '/career-data/publications/form', [
      ['title', `${marker} Two candidates`],
      ['citation', 'Example, 2026.'],
      ['year', '2026'],
      ['status', 'needs-verification'],
      ['authorName', 'Alex Example'],
      ['authorCandidate', '0'],
      ['authorName', 'Jordan Rivera'],
      ['authorCandidate', '1'],
      ['expectedRevision', '0'],
    ])
    expect(twoCandidates.status).toBe(422)
    expect(await twoCandidates.text()).toContain('Mark exactly one author as the candidate')
    expect(
      markerPublications().find((row) => row.title === `${marker} Two candidates`),
    ).toBeUndefined()
  })

  test('a non-http(s) source URL is an inline 422 and is never stored', async () => {
    const app = await harness()
    const response = await post(app, '/career-data/publications/form', [
      ['title', `${marker} Bad URL`],
      ['citation', 'Example, 2026.'],
      ['year', '2026'],
      ['status', 'preprint'],
      ['sourceUrls', 'javascript:alert(1)'],
      ['authorName', 'Alex Example'],
      ['authorCandidate', '0'],
      ['expectedRevision', '0'],
    ])
    expect(response.status).toBe(422)
    expect(await response.text()).toContain('must be a valid http:// or https:// address')
    expect(markerPublications().find((row) => row.title === `${marker} Bad URL`)).toBeUndefined()
  })

  test('the author reorder endpoint swaps order and follows the candidate flag without saving', async () => {
    const { record } = await createPublication()
    const before = markerPublications().find((row) => row.id === record?.id)
    const app = await harness()

    const response = await post(app, '/career-data/publications/authors/order', [
      ['authorName', 'Jordan Rivera'],
      ['authorCandidate', '0'],
      ['authorName', 'Alex Example'],
      ['authorName', ''],
      ['action', 'down'],
      ['index', '0'],
      ['expectedRevision', String(before?.revision ?? 1)],
    ])
    const html = await response.text()
    expect(response.status).toBe(200)
    expect(recordsFor(html, 'career-publications-authors')).toEqual([
      expect.objectContaining({ depth: 0, oob: undefined }),
    ])
    expect(html.indexOf('Alex Example')).toBeLessThan(html.indexOf('Jordan Rivera'))
    // The candidate flag travelled with the moved author to its new row index.
    expect(html).toMatch(/name="authorCandidate"[^>]*value="1"[^>]*checked/)
    // Nothing was written: the stored order is unchanged.
    expect(markerPublications().find((row) => row.id === record?.id)?.authors).toEqual([
      { name: 'Jordan Rivera', isCandidate: true },
      { name: 'Alex Example', isCandidate: false },
    ])
  })

  test('a stale publication submit is a 409 fragment and retire preserves history', async () => {
    const { app, record } = await createPublication()
    const id = record?.id

    const stale = await post(app, `/career-data/publications/${id}/form`, [
      ['title', 'Stale publication'],
      ['citation', 'Example, 2026.'],
      ['year', '2026'],
      ['status', 'preprint'],
      ['authorName', 'Alex Example'],
      ['authorCandidate', '0'],
      ['expectedRevision', '999999'],
    ])
    expect(stale.status).toBe(409)
    expect(await stale.text()).toContain('This record changed since you opened it')

    const retired = await post(app, `/career-data/publications/${id}/retire?showRetired=1`, [
      ['action', 'retire'],
    ])
    expect(recordsFor(await retired.text(), 'career-publications-list')).toEqual([
      expect.objectContaining({ depth: 0, oob: undefined }),
    ])
    expect(markerPublications().find((row) => row.id === id)?.authors).toEqual([
      { name: 'Jordan Rivera', isCandidate: true },
      { name: 'Alex Example', isCandidate: false },
    ])
  })

  test('a retired project cannot be newly linked to a publication', async () => {
    const project = seedProject()
    retireCareerProject(db, project.id)
    const app = await harness()
    const response = await post(app, '/career-data/publications/form', [
      ['title', `${marker} Links a retired project`],
      ['citation', 'Example, 2026.'],
      ['year', '2026'],
      ['status', 'preprint'],
      ['projectIds', String(project.id)],
      ['authorName', 'Alex Example'],
      ['authorCandidate', '0'],
      ['expectedRevision', '0'],
    ])
    expect(response.status).toBe(422)
    expect(await response.text()).toContain('retired')
    expect(
      markerPublications().find((row) => row.title === `${marker} Links a retired project`),
    ).toBeUndefined()
  })
})

describe('portfolio form', () => {
  test('create persists outline, details, order and project links', async () => {
    const direction = seedDirection()
    const project = seedProject()
    const app = await harness()
    const response = await post(app, '/career-data/portfolio/form', [
      ['title', `${marker} Synthetic topic`],
      ['status', 'draft'],
      ['sortOrder', '3'],
      ['projectIds', String(project.id)],
      ['directions', direction],
      ['outline', 'Synthetic problem statement\nSynthetic approach'],
      ['details', 'Synthetic portfolio detail text.'],
      ['extensionFields', 'importSource = legacy portfolio-content.json'],
      ['expectedRevision', '0'],
    ])
    const html = await response.text()
    expect(response.status).toBe(200)
    const record = markerTopics().find((row) => row.title === `${marker} Synthetic topic`)
    expect(record?.stableKey).toBe('career-ui9-synthetic-topic')
    expect(record?.sortOrder).toBe(3)
    expect(record?.outline).toEqual(['Synthetic problem statement', 'Synthetic approach'])
    expect(record?.details).toBe('Synthetic portfolio detail text.')
    expect(record?.projectIds).toEqual([project.id])
    expect(record?.directions).toEqual([direction])
    expect(recordsFor(html, `career-portfolio-${record?.id}-form`)).toEqual([
      expect.objectContaining({ depth: 0, oob: undefined }),
    ])
    expect(recordsFor(html, 'career-portfolio-list')).toEqual([
      expect.objectContaining({ depth: 0, oob: 'outerHTML' }),
    ])

    const edit = await (await app.request(`/career-data/portfolio/${record?.id}/form`)).text()
    expect(edit).toContain('importSource = legacy portfolio-content.json')
    expect(edit).toContain('Synthetic approach')
  })

  test('a missing title is a 422 that returns only the form', async () => {
    const app = await harness()
    const response = await post(app, '/career-data/portfolio/form', [
      ['title', ''],
      ['expectedRevision', '0'],
    ])
    const html = await response.text()
    expect(response.status).toBe(422)
    expect(response.headers.get('HX-Retarget')).toBe('#career-portfolio-form')
    expect(recordsFor(html, 'career-portfolio-form')).toEqual([
      expect.objectContaining({ depth: 0, oob: undefined }),
    ])
    expect(html).toContain('Topic title is required.')
    expect(markerTopics()).toHaveLength(0)
  })

  test('re-saving identical portfolio content is a no-op that does not bump the revision', async () => {
    const app = await harness()
    await post(app, '/career-data/portfolio/form', [
      ['title', `${marker} Unchanged`],
      ['status', 'draft'],
      ['sortOrder', '0'],
      ['expectedRevision', '0'],
    ])
    const created = markerTopics().find((row) => row.title === `${marker} Unchanged`)
    expect(created?.revision).toBe(1)

    const noop = await post(app, `/career-data/portfolio/${created?.id}/form`, [
      ['title', `${marker} Unchanged`],
      ['status', 'draft'],
      ['sortOrder', '0'],
      ['expectedRevision', String(created?.revision ?? 1)],
    ])
    expect(noop.status).toBe(200)
    // The repository guarantees no-op invisibility: revision and stored row are identical.
    expect(markerTopics().find((row) => row.id === created?.id)?.revision).toBe(created?.revision)
  })

  test('a stale topic submit is a 409 fragment and retire returns the list only', async () => {
    const app = await harness()
    await post(app, '/career-data/portfolio/form', [
      ['title', `${marker} Keep`],
      ['expectedRevision', '0'],
    ])
    const record = markerTopics().find((row) => row.title === `${marker} Keep`)
    const id = record?.id

    const stale = await post(app, `/career-data/portfolio/${id}/form`, [
      ['title', 'Stale topic'],
      ['expectedRevision', '999999'],
    ])
    expect(stale.status).toBe(409)
    expect(await stale.text()).toContain('This record changed since you opened it')

    const retired = await post(app, `/career-data/portfolio/${id}/retire?showRetired=1`, [
      ['action', 'retire'],
    ])
    expect(recordsFor(await retired.text(), 'career-portfolio-list')).toEqual([
      expect.objectContaining({ depth: 0, oob: undefined }),
    ])
    expect(markerTopics().find((row) => row.id === id)?.retiredAt).not.toBeNull()
    expect(markerTopics().find((row) => row.id === id)?.title).toBe(`${marker} Keep`)
  })
})

describe('preferences singleton form', () => {
  test('save persists repeatable locations, work modes and compensation, and a no-op is invisible', async () => {
    const app = await harness()
    // The preferences row is shared with suites that seed the synthetic fixtures,
    // so the form always carries the revision currently stored.
    const revision = String(readCareerPreferences(db)?.revision ?? 0)
    const save = (entries: Array<[string, string]>) =>
      post(app, '/career-data/preferences/form', [['expectedRevision', revision], ...entries])

    const first = await save([
      ['locations', 'Edmonton, AB\nRemote (Canada)'],
      ['workModes', 'remote\nhybrid'],
      ['availability', 'Two weeks notice'],
      ['compensationCurrency', 'CAD'],
      ['compensationMinimum', '120000'],
      ['compensationNotes', 'Synthetic range.'],
      ['notes', 'Synthetic preference.'],
    ])
    const firstHtml = await first.text()
    expect(first.status).toBe(200)
    expect(firstHtml).toContain('Preferences saved.')
    expect(recordsFor(firstHtml, 'career-preferences-form')).toEqual([
      expect.objectContaining({ depth: 0, oob: undefined }),
    ])
    expect(recordsFor(firstHtml, 'career-preferences-panel')).toEqual([
      expect.objectContaining({ depth: 0, oob: 'outerHTML' }),
    ])
    expect(recordsFor(firstHtml, 'career-data-tabs')).toEqual([
      expect.objectContaining({ depth: 0, oob: 'outerHTML' }),
    ])

    const stored = readCareerPreferences(db)
    expect(stored?.locations).toEqual(['Edmonton, AB', 'Remote (Canada)'])
    expect(stored?.workModes).toEqual(['remote', 'hybrid'])
    expect(stored?.availability).toBe('Two weeks notice')
    expect(stored?.compensation).toMatchObject({ currency: 'CAD', minimum: 120000 })

    // Reloading the edit form keeps the stored values and the revision.
    const reload = await (await app.request('/career-data/preferences/form')).text()
    expect(reload).toContain('Edmonton, AB')
    expect(reload).toContain('Two weeks notice')

    const noop = await post(app, '/career-data/preferences/form', [
      ['expectedRevision', String(stored?.revision ?? 1)],
      ['locations', 'Edmonton, AB\nRemote (Canada)'],
      ['workModes', 'remote\nhybrid'],
      ['availability', 'Two weeks notice'],
      ['compensationCurrency', 'CAD'],
      ['compensationMinimum', '120000'],
      ['compensationNotes', 'Synthetic range.'],
      ['notes', 'Synthetic preference.'],
    ])
    const noopHtml = await noop.text()
    expect(noop.status).toBe(200)
    expect(noopHtml).toContain('No changes to save.')
    expect(readCareerPreferences(db)?.revision).toBe(stored?.revision)
  })

  test('a stale preferences submit is a 409 fragment and an invalid value is a 422 form', async () => {
    const app = await harness()
    const stale = await post(app, '/career-data/preferences/form', [
      ['expectedRevision', '999999'],
      ['locations', 'Nowhere'],
    ])
    expect(stale.status).toBe(409)
    expect(stale.headers.get('HX-Retarget')).toBe('#career-preferences-form')
    expect(await stale.text()).toContain('This record changed since you opened it')

    const invalid = await post(app, '/career-data/preferences/form', [
      ['expectedRevision', '0'],
      ['compensationMinimum', 'not-a-number'],
    ])
    const html = await invalid.text()
    expect(invalid.status).toBe(422)
    expect(recordsFor(html, 'career-preferences-form')).toEqual([
      expect.objectContaining({ depth: 0, oob: undefined }),
    ])
    expect(recordsFor(html, 'career-data-section')).toHaveLength(0)
    expect(html).toContain('Compensation minimum')
  })
})
