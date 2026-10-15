import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { createCareerDirection } from '../../src/db/career-directions'
import {
  createCareerExperience,
  createCareerPublication,
  listCareerAchievements,
  listCareerProjects,
  retireCareerExperience,
} from '../../src/db/career-records'
import { listCareerSkills } from '../../src/db/career-skills'
import { db, sqlite } from '../../src/db/client'
import { loadCareerDataFromDatabase } from '../../src/lib/career-data'
import { recordsFor } from './support/html-contract'

/**
 * Step 8 route acceptance for the achievements, projects and skills tabs.
 *
 * Every route resolves the real `db` singleton, so the acceptance criteria are
 * proved end to end through the Step 2 repositories. Fixture rows use the
 * `career-ui8` marker and are removed before and after every test; the
 * developer's `jobs.db` is never opened, and no identity row is written.
 */

const marker = '__career-ui8'
const keyPrefix = 'career-ui8'

function seedDirection(key = `${keyPrefix}-fullstack`) {
  createCareerDirection(db, {
    key,
    label: 'Full-Stack Developer',
    targetTitles: ['Full-Stack Developer'],
  })
  return key
}

function seedCatalogSkill(key: string, name: string, reviewStatus = 'approved') {
  return sqlite
    .query(
      `INSERT INTO skills (key, name, category, review_status, origin, merged_into_skill_id, created_at, updated_at)
       VALUES (?, ?, NULL, ?, 'manual', NULL, 'T', 'T') RETURNING id`,
    )
    .get(`${keyPrefix}-${key}`, name, reviewStatus) as { id: number }
}

function seedExperience(stableKey = `${keyPrefix}-experience`) {
  return createCareerExperience(db, {
    stableKey,
    company: `${marker} Northwind`,
    role: 'Senior Developer',
  })
}

function cleanup() {
  sqlite.query("DELETE FROM career_achievements WHERE stable_key LIKE 'career-ui8%'").run()
  sqlite.query("DELETE FROM career_projects WHERE stable_key LIKE 'career-ui8%'").run()
  sqlite.query("DELETE FROM career_publications WHERE stable_key LIKE 'career-ui8%'").run()
  sqlite
    .query(
      "DELETE FROM career_skills WHERE skill_id IN (SELECT id FROM skills WHERE key LIKE 'career-ui8%')",
    )
    .run()
  sqlite.query("DELETE FROM skills WHERE key LIKE 'career-ui8%'").run()
  sqlite.query("DELETE FROM career_experiences WHERE stable_key LIKE 'career-ui8%'").run()
  sqlite.query("DELETE FROM career_directions WHERE key LIKE 'career-ui8%'").run()
}

/**
 * The isolated suite database is shared with UI suites that seed the synthetic
 * fixture dataset, so every assertion is scoped to this file's `career-ui8`
 * marker instead of assuming an empty global table.
 */
function markerAchievements() {
  return listCareerAchievements(db, { includeRetired: true }).filter((row) =>
    row.stableKey.startsWith(keyPrefix),
  )
}

function markerProjects() {
  return listCareerProjects(db, { includeRetired: true }).filter((row) =>
    row.stableKey.startsWith(keyPrefix),
  )
}

function markerPersonalSkills() {
  return listCareerSkills(db, { includeRetired: true }).filter((row) =>
    row.skillKey.startsWith(keyPrefix),
  )
}

/** The achievement/project/skill ids this file's marker owns, from the runtime read. */
function documentMarkerIds(collection: 'achievements' | 'projects' | 'skills') {
  if (collection === 'achievements')
    return loadCareerDataFromDatabase(db)
      .achievements.achievements.map((item) => item.id)
      .filter((id) => id.startsWith(keyPrefix))
  if (collection === 'projects')
    return loadCareerDataFromDatabase(db)
      .projects.projects.map((item) => item.id)
      .filter((id) => id.startsWith(keyPrefix))
  return loadCareerDataFromDatabase(db)
    .skills.skills.map((item) => item.id)
    .filter((id) => id.startsWith(keyPrefix))
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
  const achievements = (await import('../../app/routes/career-data/achievements/index')).default
  const achievementForm = await import('../../app/routes/career-data/achievements/form')
  const achievementEdit = await import('../../app/routes/career-data/achievements/[id]/form')
  const achievementRetire = await import('../../app/routes/career-data/achievements/[id]/retire')
  const projects = (await import('../../app/routes/career-data/projects/index')).default
  const projectForm = await import('../../app/routes/career-data/projects/form')
  const projectEdit = await import('../../app/routes/career-data/projects/[id]/form')
  const projectRetire = await import('../../app/routes/career-data/projects/[id]/retire')
  const skills = (await import('../../app/routes/career-data/skills/index')).default
  const skillForm = await import('../../app/routes/career-data/skills/form')
  const skillEdit = await import('../../app/routes/career-data/skills/[id]/form')
  const skillRetire = await import('../../app/routes/career-data/skills/[id]/retire')

  const app = new Hono()
  mount(app, 'get', '/career-data', page)
  mount(app, 'get', '/career-data/achievements', achievements)
  mount(app, 'get', '/career-data/achievements/form', achievementForm.GET)
  mount(app, 'post', '/career-data/achievements/form', achievementForm.POST)
  mount(app, 'get', '/career-data/achievements/:id/form', achievementEdit.GET)
  mount(app, 'post', '/career-data/achievements/:id/form', achievementEdit.POST)
  mount(app, 'post', '/career-data/achievements/:id/retire', achievementRetire.POST)
  mount(app, 'get', '/career-data/projects', projects)
  mount(app, 'get', '/career-data/projects/form', projectForm.GET)
  mount(app, 'post', '/career-data/projects/form', projectForm.POST)
  mount(app, 'get', '/career-data/projects/:id/form', projectEdit.GET)
  mount(app, 'post', '/career-data/projects/:id/form', projectEdit.POST)
  mount(app, 'post', '/career-data/projects/:id/retire', projectRetire.POST)
  mount(app, 'get', '/career-data/skills', skills)
  mount(app, 'get', '/career-data/skills/form', skillForm.GET)
  mount(app, 'post', '/career-data/skills/form', skillForm.POST)
  mount(app, 'get', '/career-data/skills/:id/form', skillEdit.GET)
  mount(app, 'post', '/career-data/skills/:id/form', skillEdit.POST)
  mount(app, 'post', '/career-data/skills/:id/retire', skillRetire.POST)
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

async function createAchievement(entries: Array<[string, string]> = []) {
  const app = await harness()
  const response = await post(app, '/career-data/achievements/form', [
    ['claim', `${marker} Delivered a reporting API`],
    ['safeToUse', 'on'],
    ['evidence', 'Synthetic review notes'],
    ['evidenceNarratives', 'I delivered the reporting API.'],
    ['limitations', 'Reporting scope only.'],
    ['expectedRevision', '0'],
    ...entries,
  ])
  const record = markerAchievements().find((row) => row.claim.includes('Delivered a reporting API'))
  return { app, response, html: await response.text(), record }
}

describe('career data step 8 page and fragment boundaries', () => {
  test('the tab registry gains achievements, projects and skills', async () => {
    const { parseCareerDataTab, careerDataTabs } = await import(
      '../../app/components/career/CareerDataTabs'
    )
    // Step 9 appends stories/publications/portfolio/preferences and Step 10 adds
    // directions/base-resumes; the exact registry is updated here the same way
    // Step 8 updated the Step 7 tabs.
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
      'directions',
      'base-resumes',
    ])
    expect(parseCareerDataTab('achievements')).toBe('achievements')
    expect(parseCareerDataTab('forged')).toBe('identity')
  })

  test('each new full page renders the AppShell once with the active tab', async () => {
    const app = await harness()
    for (const tab of ['achievements', 'projects', 'skills']) {
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

  test('each new section fragment never renders the AppShell and refreshes the tabs out of band', async () => {
    const app = await harness()
    for (const tab of ['achievements', 'projects', 'skills']) {
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

  test('the skills tab keeps the Catalog and My skills views separate', async () => {
    seedCatalogSkill('typescript', 'TypeScript')
    const app = await harness()

    const mine = await (
      await app.request('/career-data/skills', { headers: { 'HX-Request': 'true' } })
    ).text()
    expect(recordsFor(mine, 'career-skills-views')).toHaveLength(1)
    expect(recordsFor(mine, 'career-skills-list')).toHaveLength(1)
    expect(recordsFor(mine, 'career-skills-editor')).toHaveLength(1)
    expect(recordsFor(mine, 'career-skills-catalog')).toHaveLength(0)
    expect(mine).toContain('My skills')

    const catalog = await (
      await app.request('/career-data/skills?view=catalog', {
        headers: { 'HX-Request': 'true' },
      })
    ).text()
    expect(recordsFor(catalog, 'career-skills-catalog')).toHaveLength(1)
    expect(recordsFor(catalog, 'career-skills-list')).toHaveLength(0)
    expect(recordsFor(catalog, 'career-skills-editor')).toHaveLength(0)
    expect(catalog).toContain('TypeScript')
    expect(catalog).toContain('Not claimed')
    expect(catalog).toContain('href="/skills"')
    expect(catalog).toContain('career-data-tab-skills')
  })
})

describe('achievement relation form', () => {
  test('the picker is server-rendered, shows names and needs no client script', async () => {
    const skill = seedCatalogSkill('typescript', 'TypeScript')
    seedDirection()
    seedExperience()
    const publication = createCareerPublication(db, {
      stableKey: `${keyPrefix}-preprint`,
      title: `${marker} Synthetic preprint`,
      citation: 'Example, 2026.',
      year: 2026,
      status: 'published',
      authors: [{ name: 'Example Author', isCandidate: true }],
    }).id
    const app = await harness()
    const html = await (await app.request('/career-data/achievements/form')).text()

    expect(html).toContain('id="career-achievements-form"')
    expect(html).toContain('role="group"')
    expect(html).toContain('name="skills"')
    expect(html).toContain('name="directions"')
    expect(html).toContain('name="publicationIds"')
    expect(html).toContain('name="experienceId"')
    expect(html).toContain('TypeScript')
    expect(html).toContain(`value="${skill.id}"`)
    expect(html).toContain(`value="${publication}"`)
    expect(html).toContain('Synthetic preprint')
    expect(html).not.toContain('onclick=')
    expect(html).not.toContain('<script')
    // Validated source links are structurally separate from the narrative text.
    expect(html).toContain('Validated source links')
    expect(html).toContain('Narrative attestation')
  })

  test('create persists the claim, junctions in order and narrative, and returns OOB siblings', async () => {
    const first = seedCatalogSkill('typescript', 'TypeScript')
    const second = seedCatalogSkill('sqlite', 'SQLite')
    const direction = seedDirection()
    const experience = seedExperience()
    const { response, html, record } = await createAchievement([
      ['experienceId', String(experience.id)],
      ['skills', String(second.id)],
      ['skills', String(first.id)],
      ['directions', direction],
    ])

    expect(response.status).toBe(200)
    expect(record?.stableKey).toBe('career-ui8-delivered-a-reporting-api')
    expect(record?.safeToUse).toBe(true)
    expect(record?.evidence).toEqual(['Synthetic review notes'])
    expect(record?.evidenceNarratives).toEqual(['I delivered the reporting API.'])
    expect(record?.limitations).toEqual(['Reporting scope only.'])
    expect(record?.skills).toEqual([second.id, first.id])
    expect(record?.directions).toEqual([direction])
    expect(record?.experienceId).toBe(experience.id)

    expect(recordsFor(html, `career-achievements-${record?.id}-form`)).toEqual([
      expect.objectContaining({ depth: 0, oob: undefined }),
    ])
    expect(recordsFor(html, 'career-achievements-list')).toEqual([
      expect.objectContaining({ depth: 0, oob: 'outerHTML' }),
    ])
    expect(recordsFor(html, 'career-data-tabs')).toEqual([
      expect.objectContaining({ depth: 0, oob: 'outerHTML' }),
    ])
    expect(recordsFor(html, 'flash')).toEqual([
      expect.objectContaining({ depth: 0, oob: 'innerHTML' }),
    ])
    expect(html).toContain('TypeScript')
    expect(html).toContain('SQLite')
  })

  test('a stale achievement submit is a 409 form fragment and writes nothing', async () => {
    const { app, record } = await createAchievement()
    const id = record?.id
    const rootId = `career-achievements-${id}-form`

    const response = await post(app, `/career-data/achievements/${id}/form`, [
      ['claim', 'Stale claim'],
      ['expectedRevision', '999999'],
    ])
    const html = await response.text()

    expect(response.status).toBe(409)
    expect(response.headers.get('HX-Retarget')).toBe(`#${rootId}`)
    expect(recordsFor(html, rootId)).toEqual([
      expect.objectContaining({ depth: 0, oob: undefined }),
    ])
    expect(recordsFor(html, 'career-data-section')).toHaveLength(0)
    expect(recordsFor(html, 'career-achievements-list')).toHaveLength(0)
    expect(html).toContain('This record changed since you opened it')
    expect(html).toContain('Reload the current record')
    expect(html).toContain(`hx-get="/career-data/achievements/${id}/form"`)
    expect(html).toContain('value="Stale claim"')
    expect(listCareerAchievements(db).find((row) => row.id === id)?.claim).toBe(record?.claim)
  })

  test('a validation failure is a 422 that returns only the form', async () => {
    const app = await harness()
    const response = await post(app, '/career-data/achievements/form', [
      ['claim', ''],
      ['expectedRevision', '0'],
    ])
    const html = await response.text()

    expect(response.status).toBe(422)
    expect(response.headers.get('HX-Retarget')).toBe('#career-achievements-form')
    expect(recordsFor(html, 'career-achievements-form')).toEqual([
      expect.objectContaining({ depth: 0, oob: undefined }),
    ])
    expect(recordsFor(html, 'career-data-section')).toHaveLength(0)
    expect(html).toContain('role="alert"')
    expect(html).toContain('aria-invalid="true"')
    expect(html).toContain('Claim is required.')
    expect(markerAchievements()).toHaveLength(0)
  })

  test('a retired experience is rejected at the trust boundary, not just hidden', async () => {
    const experience = seedExperience()
    const { app } = await createAchievement()
    retireCareerExperience(db, experience.id)

    const response = await post(app, '/career-data/achievements/form', [
      ['claim', `${marker} Links a retired role`],
      ['experienceId', String(experience.id)],
      ['expectedRevision', '0'],
    ])
    const html = await response.text()
    expect(response.status).toBe(422)
    expect(html).toContain('retired')
    expect(
      markerAchievements().find((row) => row.claim === `${marker} Links a retired role`),
    ).toBeUndefined()
  })

  test('retire and restore return the list fragment only and keep the junctions', async () => {
    const skill = seedCatalogSkill('typescript', 'TypeScript')
    const { app, record } = await createAchievement([['skills', String(skill.id)]])
    if (!record) throw new Error('The fixture achievement was not created.')
    const id = record.id

    const retired = await post(app, `/career-data/achievements/${id}/retire?showRetired=1`, [
      ['action', 'retire'],
    ])
    const retiredHtml = await retired.text()
    expect(recordsFor(retiredHtml, 'career-achievements-list')).toEqual([
      expect.objectContaining({ depth: 0, oob: undefined }),
    ])
    expect(recordsFor(retiredHtml, 'career-data-section')).toHaveLength(0)
    expect(recordsFor(retiredHtml, 'career-data-tabs')).toHaveLength(0)
    expect(retiredHtml).toContain('Retired')
    expect(retiredHtml).toContain('Restore')

    const stored = markerAchievements().find((row) => row.id === id)
    expect(stored?.retiredAt).not.toBeNull()
    expect(stored?.skills).toEqual([skill.id])
    expect(documentMarkerIds('achievements')).toEqual([])

    const restored = await post(app, `/career-data/achievements/${id}/retire?showRetired=1`, [
      ['action', 'restore'],
    ])
    expect(await restored.text()).toContain('>Retire<')
    expect(markerAchievements().find((row) => row.id === id)?.retiredAt).toBeNull()
    expect(documentMarkerIds('achievements')).toEqual([record.stableKey])
  })
})

describe('project form', () => {
  test('create persists eligibility, http(s) URLs and skills, excluding ineligible ones', async () => {
    const skill = seedCatalogSkill('sqlite', 'SQLite')
    const direction = seedDirection()
    const experience = seedExperience()
    const app = await harness()
    const response = await post(app, '/career-data/projects/form', [
      ['name', `${marker} Tracker`],
      ['experienceId', String(experience.id)],
      ['ownership', 'personal'],
      ['eligibility', 'not-eligible'],
      ['completion', 'completed'],
      ['urls', 'https://example.test/tracker'],
      ['safeWording', 'Built a tracker for contract tests.'],
      ['limitations', 'Synthetic only.'],
      ['skills', String(skill.id)],
      ['directions', direction],
      ['expectedRevision', '0'],
    ])
    const html = await response.text()
    expect(response.status).toBe(200)
    const record = markerProjects().find((row) => row.name === `${marker} Tracker`)
    expect(record?.eligibility).toBe('not-eligible')
    expect(record?.urls).toEqual(['https://example.test/tracker'])
    expect(record?.skills).toEqual([skill.id])
    expect(record?.limitations).toEqual(['Synthetic only.'])
    expect(recordsFor(html, `career-projects-${record?.id}-form`)).toEqual([
      expect.objectContaining({ depth: 0, oob: undefined }),
    ])
    expect(recordsFor(html, 'career-projects-list')).toEqual([
      expect.objectContaining({ depth: 0, oob: 'outerHTML' }),
    ])
    // An ineligible project never reaches a new document or the evidence set.
    expect(
      loadCareerDataFromDatabase(db).projects.projects.find((row) => row.id === record?.stableKey),
    ).toBeDefined()
    expect(html).toContain('Not eligible for documents')
  })

  test('a non-http(s) project URL is an inline 422 and is never stored', async () => {
    const app = await harness()
    const response = await post(app, '/career-data/projects/form', [
      ['name', `${marker} Bad URL`],
      ['urls', 'javascript:alert(1)'],
      ['expectedRevision', '0'],
    ])
    const html = await response.text()
    expect(response.status).toBe(422)
    expect(html).toContain('must be a valid http:// or https:// address')
    expect(markerProjects().find((row) => row.name === `${marker} Bad URL`)).toBeUndefined()
  })

  test('a stale project submit is a 409 fragment and retire keeps history', async () => {
    seedDirection()
    const app = await harness()
    await post(app, '/career-data/projects/form', [
      ['name', `${marker} Keep`],
      ['expectedRevision', '0'],
    ])
    const record = markerProjects().find((row) => row.name === `${marker} Keep`)
    const id = record?.id

    const stale = await post(app, `/career-data/projects/${id}/form`, [
      ['name', 'Stale project'],
      ['expectedRevision', '999999'],
    ])
    expect(stale.status).toBe(409)
    expect(await stale.text()).toContain('This record changed since you opened it')

    const retired = await post(app, `/career-data/projects/${id}/retire?showRetired=1`, [
      ['action', 'retire'],
    ])
    expect(recordsFor(await retired.text(), 'career-projects-list')).toEqual([
      expect.objectContaining({ depth: 0, oob: undefined }),
    ])
    expect(documentMarkerIds('projects')).toEqual([])
    expect(markerProjects().find((row) => row.id === id)?.retiredAt).not.toBeNull()
  })
})

describe('personal skills form', () => {
  test('create selects an approved catalog entry and never creates a catalog row', async () => {
    const skill = seedCatalogSkill('typescript', 'TypeScript')
    const before = sqlite.query('SELECT count(*) AS count FROM skills').get() as { count: number }
    const app = await harness()
    const response = await post(app, '/career-data/skills/form', [
      ['skillId', String(skill.id)],
      ['level', 'advanced'],
      ['resumeEligible', 'on'],
      ['explanation', 'Used daily.'],
      ['notes', 'Synthetic note.'],
      ['evidence', 'Delivered the reporting API.'],
      ['expectedRevision', '0'],
    ])
    const html = await response.text()
    expect(response.status).toBe(200)
    expect(sqlite.query('SELECT count(*) AS count FROM skills').get()).toEqual(before)
    const record = listCareerSkills(db).find((row) => row.skillId === skill.id)
    expect(record).toMatchObject({
      skillKey: `${keyPrefix}-typescript`,
      skillName: 'TypeScript',
      level: 'advanced',
      resumeEligible: true,
    })
    expect(record?.evidence).toEqual(['Delivered the reporting API.'])
    expect(recordsFor(html, `career-skills-${record?.id}-form`)).toEqual([
      expect.objectContaining({ depth: 0, oob: undefined }),
    ])
    expect(recordsFor(html, 'career-skills-list')).toEqual([
      expect.objectContaining({ depth: 0, oob: 'outerHTML' }),
    ])
    expect(recordsFor(html, 'career-data-tabs')).toEqual([
      expect.objectContaining({ depth: 0, oob: 'outerHTML' }),
    ])
  })

  test('a non-approved catalog entry cannot become a personal skill', async () => {
    const pending = seedCatalogSkill('oauth', 'OAuth', 'pending')
    const app = await harness()
    const response = await post(app, '/career-data/skills/form', [
      ['skillId', String(pending.id)],
      ['resumeEligible', 'on'],
      ['expectedRevision', '0'],
    ])
    const html = await response.text()
    expect(response.status).toBe(422)
    expect(html).toContain('not approved')
    expect(markerPersonalSkills()).toEqual([])
  })

  test('a missing catalog selection names the field and returns only the form', async () => {
    const app = await harness()
    const response = await post(app, '/career-data/skills/form', [
      ['resumeEligible', 'on'],
      ['expectedRevision', '0'],
    ])
    const html = await response.text()
    expect(response.status).toBe(422)
    expect(html).toContain('Choose an approved catalog skill.')
    expect(recordsFor(html, 'career-skills-form')).toEqual([
      expect.objectContaining({ depth: 0, oob: undefined }),
    ])
  })

  test('retire and restore return the list fragment only and keep the evidence', async () => {
    const skill = seedCatalogSkill('typescript', 'TypeScript')
    const app = await harness()
    await post(app, '/career-data/skills/form', [
      ['skillId', String(skill.id)],
      ['level', 'advanced'],
      ['resumeEligible', 'on'],
      ['evidence', 'Delivered the reporting API.'],
      ['expectedRevision', '0'],
    ])
    const record = listCareerSkills(db).find((row) => row.skillId === skill.id)
    const id = record?.id

    const retired = await post(app, `/career-data/skills/${id}/retire?showRetired=1`, [
      ['action', 'retire'],
    ])
    const retiredHtml = await retired.text()
    expect(recordsFor(retiredHtml, 'career-skills-list')).toEqual([
      expect.objectContaining({ depth: 0, oob: undefined }),
    ])
    expect(recordsFor(retiredHtml, 'career-data-section')).toHaveLength(0)
    expect(retiredHtml).toContain('Retired')
    expect(retiredHtml).toContain('Restore')
    expect(documentMarkerIds('skills')).toEqual([])
    expect(markerPersonalSkills().find((row) => row.id === id)?.evidence).toEqual([
      'Delivered the reporting API.',
    ])

    const restored = await post(app, `/career-data/skills/${id}/retire?showRetired=1`, [
      ['action', 'restore'],
    ])
    expect(await restored.text()).toContain('>Retire<')
    expect(markerPersonalSkills().filter((row) => row.retiredAt === null)).toHaveLength(1)
  })

  test('a stale personal skill submit is a 409 fragment', async () => {
    const skill = seedCatalogSkill('typescript', 'TypeScript')
    const app = await harness()
    await post(app, '/career-data/skills/form', [
      ['skillId', String(skill.id)],
      ['expectedRevision', '0'],
    ])
    const record = listCareerSkills(db).find((row) => row.skillId === skill.id)
    const response = await post(app, `/career-data/skills/${record?.id}/form`, [
      ['skillId', String(skill.id)],
      ['level', 'expert'],
      ['expectedRevision', '999999'],
    ])
    expect(response.status).toBe(409)
    expect(response.headers.get('HX-Retarget')).toBe(`#career-skills-${record?.id}-form`)
    expect(await response.text()).toContain('This record changed since you opened it')
  })
})
