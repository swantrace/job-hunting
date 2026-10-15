import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { Hono } from 'hono'
import PizZip from 'pizzip'
import { db, sqlite } from '../../src/db/client'
import { careerExperiences, skillAliases, skillCategories, skills } from '../../src/db/schema'
import { careerDatasetFormat } from '../../src/lib/career/dataset'
import { applyCareerImport, prepareCareerImport } from '../../src/lib/career-import'
import {
  approvedBaseResumeManifest,
  approvedBaseResumeMarkdown,
  syntheticCareerDocuments,
  syntheticTaxonomy,
} from '../career/fixtures'
import { recordsFor } from './support/html-contract'

/**
 * Step 11 route acceptance for the Career data "Import & export" tab.
 *
 * This file runs in its own child process with a private `DB_FILE_NAME` (see
 * `career-data-step11.integration.test.tsx`), exactly like the Step 4
 * runtime-read acceptance. It therefore exercises the real `db` singleton and the
 * real route modules against a temporary migrated database outside the
 * repository; the developer's `jobs.db` and private `career-data/` are never
 * opened.
 *
 * Every test resets the career rows first, so "inserted" counts are exact and the
 * conflict and stale-preview cases are deterministic.
 */

const databaseRoot = mkdtempSync(resolve(tmpdir(), 'job-tracker-step11-'))

afterAll(() => {
  rmSync(databaseRoot, { force: true, recursive: true })
})

const careerTables = [
  'career_achievement_skills',
  'career_project_skills',
  'career_publication_projects',
  'career_achievement_publications',
  'career_portfolio_topic_projects',
  'career_record_directions',
  'career_base_resumes',
  'career_skills',
  'career_achievements',
  'career_projects',
  'career_publications',
  'career_stories',
  'career_portfolio_topics',
  'career_experiences',
  'career_education',
  'career_directions',
  'career_profile',
  'skill_aliases',
  'skills',
  'skill_categories',
] as const

/** Clears every career row and restores the `career_state` singleton. */
function resetDatabase() {
  for (const table of careerTables) sqlite.exec(`DELETE FROM ${table}`)
  sqlite.exec("UPDATE career_state SET revision = 0, content_hash = '' WHERE id = 1")
}

/** Imports the synthetic fixtures through the Step 3 importer into `db`. */
function seedSyntheticCareerData() {
  const directory = mkdtempSync(resolve(databaseRoot, 'seed-'))
  try {
    for (const [name, document] of Object.entries(syntheticCareerDocuments)) {
      Bun.write(resolve(directory, name), `${JSON.stringify(document, null, 2)}\n`)
    }
    Bun.write(resolve(directory, 'skill-taxonomy.json'), JSON.stringify(syntheticTaxonomy, null, 2))
    const baseResumes = resolve(directory, 'base-resumes')
    Bun.write(
      resolve(baseResumes, 'manifest.json'),
      JSON.stringify(approvedBaseResumeManifest(), null, 2),
    )
    Bun.write(resolve(baseResumes, 'fullstack.md'), approvedBaseResumeMarkdown)
    const preview = prepareCareerImport(db, { kind: 'directory', directory })
    if (preview.conflicts.length > 0)
      throw new Error(`Synthetic fixtures reported conflicts: ${preview.conflicts.join(' ')}`)
    applyCareerImport(db, preview)
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
}

const page = (await import('../../app/routes/career-data/transfer/index')).default
const importRoute = (await import('../../app/routes/career-data/transfer/import')).POST
const confirmRoute = (await import('../../app/routes/career-data/transfer/import/confirm')).POST
const datasetExport = (await import('../../app/routes/career-data/transfer/export/dataset')).GET
const contextExport = (await import('../../app/routes/career-data/transfer/export/context')).GET
const contextPreview = (
  await import('../../app/routes/career-data/transfer/export/context-preview')
).GET

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

function harness() {
  const app = new Hono()
  mount(app, 'get', '/career-data/transfer', page)
  mount(app, 'post', '/career-data/transfer/import', importRoute)
  mount(app, 'post', '/career-data/transfer/import/confirm', confirmRoute)
  mount(app, 'get', '/career-data/transfer/export/dataset', datasetExport)
  mount(app, 'get', '/career-data/transfer/export/context', contextExport)
  mount(app, 'get', '/career-data/transfer/export/context-preview', contextPreview)
  return app
}

function zipOf(entries: Record<string, string>, prefix = ''): ArrayBuffer {
  const zip = new PizZip()
  for (const [name, content] of Object.entries(entries)) zip.file(`${prefix}${name}`, content)
  return zip.generate({ compression: 'DEFLATE', type: 'arraybuffer' }) as ArrayBuffer
}

function legacyEntries(): Record<string, string> {
  const entries: Record<string, string> = {
    'skill-taxonomy.json': JSON.stringify(syntheticTaxonomy),
  }
  for (const [name, document] of Object.entries(syntheticCareerDocuments)) {
    entries[name] = JSON.stringify(document)
  }
  return entries
}

async function uploadZip(app: Hono, bytes: ArrayBuffer, name = 'career-data.zip') {
  const form = new FormData()
  form.set('source', new File([bytes], name, { type: 'application/zip' }))
  return app.request('/career-data/transfer/import', { body: form, method: 'POST' })
}

function confirm(app: Hono, payload: string, sourceHash: string) {
  const form = new FormData()
  form.set('payload', payload)
  form.set('sourceHash', sourceHash)
  return app.request('/career-data/transfer/import/confirm', { body: form, method: 'POST' })
}

/** Reads the payload and fingerprint an upload preview bound into its confirm form. */
function boundPreview(html: string) {
  const payload = html.match(/name="payload" value="([^"]*)"/)?.[1]
  const sourceHash = html.match(/name="sourceHash" value="([^"]*)"/)?.[1]
  if (!payload || !sourceHash) throw new Error('preview did not bind a payload and fingerprint')
  return { payload, sourceHash }
}

describe('career transfer tab boundaries', () => {
  test('the full page renders the AppShell once with the active transfer tab', async () => {
    resetDatabase()
    seedSyntheticCareerData()
    const response = await harness().request('/career-data/transfer')
    const html = await response.text()
    expect(response.status).toBe(200)
    expect(html).toContain('id="app-nav-toggle"')
    expect(html).toContain('aria-label="Primary navigation"')
    expect(recordsFor(html, 'career-data-section')).toHaveLength(1)
    expect(recordsFor(html, 'career-data-tabs')).toHaveLength(1)
    expect(html).toContain('id="career-import-form"')
    expect(html).toContain('id="chatgpt-context-form"')
    expect(html).toContain('id="career-dataset-export-form"')
    expect(html).toContain('/career-data/transfer/export/context')
    expect(html).toContain('/career-data/transfer/export/dataset')
    expect(html).toContain('Full operational recovery needs two backups')
    expect(html).not.toContain('onclick=')
    const active = html.match(/<a[^>]*id="career-data-tab-transfer"[^>]*>/)?.[0]
    expect(active).toContain('aria-current="page"')
  })

  test('the fragment never renders the AppShell and refreshes the tabs OOB', async () => {
    resetDatabase()
    seedSyntheticCareerData()
    const response = await harness().request('/career-data/transfer', {
      headers: { 'HX-Request': 'true' },
    })
    const html = await response.text()
    expect(response.status).toBe(200)
    expect(html).not.toContain('app-nav-toggle')
    expect(recordsFor(html, 'career-data-section')).toEqual([
      expect.objectContaining({ depth: 0, oob: undefined }),
    ])
    expect(recordsFor(html, 'career-data-tabs')).toEqual([
      expect.objectContaining({ depth: 0, oob: 'outerHTML' }),
    ])
    expect(recordsFor(html, 'career-data-transfer-panel')).toHaveLength(1)
  })

  test('the export panels show the privacy defaults and the export limits', async () => {
    resetDatabase()
    const response = await harness().request('/career-data/transfer')
    const html = await response.text()
    expect(html).toContain('No direction has an approved Base Resume yet')
    expect(html).toContain('oauth-credentials')
    expect(html).toContain('artifact-binaries')
    expect(html).toContain('id="chatgpt-context-source-urls"')
    expect(html).toContain('id="chatgpt-context-contact-details"')
    expect(html).not.toMatch(/id="chatgpt-context-source-urls"[^>]*checked/)
    expect(html).not.toMatch(/id="chatgpt-context-contact-details"[^>]*checked/)
  })
})

describe('career dataset import flow', () => {
  test('a legacy zip upload previews counts, conflicts and both identities', async () => {
    resetDatabase()
    const response = await uploadZip(harness(), zipOf(legacyEntries(), 'career-data/'))
    const html = await response.text()
    expect(response.status).toBe(200)
    expect(recordsFor(html, 'career-import-preview')).toHaveLength(1)
    expect(html).toContain('Source fingerprint')
    expect(html).toContain('Database revision')
    expect(html).toContain('Planned changes')
    expect(html).toContain('Confirm import')
    expect(html).toContain('<th scope="row">experiences</th><td>2</td>')
    // Personal content is never echoed into the page.
    expect(html).not.toContain('Jordan Rivera')
    expect(html).not.toContain('jordan.rivera@example.test')
    expect(html).not.toContain(databaseRoot)
  })

  test('confirming applies the preview in one transaction', async () => {
    resetDatabase()
    const app = harness()
    const preview = await (await uploadZip(app, zipOf(legacyEntries()))).text()
    const { payload, sourceHash } = boundPreview(preview)
    const applied = await confirm(app, payload, sourceHash)
    const appliedHtml = await applied.text()
    expect(applied.status).toBe(200)
    expect(appliedHtml).toContain('Import applied in one transaction')
    expect(db.select().from(careerExperiences).all()).toHaveLength(2)

    // The stale-preview contract has two halves: the source fingerprint (proved
    // by the swapped-payload case below) and the database revision (proved by the
    // Step 3 `applyCareerImport` contract tests). Repeating an identical no-op
    // import is legitimately accepted because nothing changed.
  })

  test('confirming a preview whose payload was swapped is refused as stale', async () => {
    resetDatabase()
    const app = harness()
    const preview = await (await uploadZip(app, zipOf(legacyEntries()))).text()
    const { payload, sourceHash } = boundPreview(preview)
    const otherZip = zipOf({
      ...legacyEntries(),
      'experiences.json': JSON.stringify({
        ...(syntheticCareerDocuments['experiences.json'] as Record<string, unknown>),
        lastUpdated: '2026-10-15',
      }),
    })
    const otherPayload = Buffer.from(new Uint8Array(otherZip)).toString('base64')
    expect(otherPayload).not.toBe(payload)
    const response = await confirm(app, otherPayload, sourceHash)
    expect(response.status).toBe(422)
    expect(await response.text()).toContain('stale')
  })

  test('a zip with an ambiguous alias is blocked by conflicts and writes nothing', async () => {
    resetDatabase()
    const app = harness()
    const skillsDocument = syntheticCareerDocuments['skills.json'] as { skills: unknown[] }
    const entries = legacyEntries()
    entries['skills.json'] = JSON.stringify({
      ...skillsDocument,
      skills: [
        ...skillsDocument.skills,
        {
          id: 'nodejs-alias',
          label: 'Node Runtime',
          category: 'languages-web',
          aliases: ['TypeScript'],
        },
      ],
    })
    const preview = await (await uploadZip(app, zipOf(entries))).text()
    expect(preview).toContain('conflict(s) block this import')
    const { payload, sourceHash } = boundPreview(preview)
    const applied = await confirm(app, payload, sourceHash)
    expect(applied.status).toBe(422)
    expect(await applied.text()).toContain('blocked by conflicts')
    expect(db.select().from(careerExperiences).all()).toHaveLength(0)
    expect(db.select().from(skills).all()).toHaveLength(0)
    expect(db.select().from(skillCategories).all()).toHaveLength(0)
    expect(db.select().from(skillAliases).all()).toHaveLength(0)
  })

  test('an invalid upload is a 422 that retargets the upload form', async () => {
    resetDatabase()
    const response = await uploadZip(
      harness(),
      new TextEncoder().encode('not a zip').buffer as ArrayBuffer,
    )
    const html = await response.text()
    expect(response.status).toBe(422)
    expect(response.headers.get('HX-Retarget')).toBe('#career-import-form')
    expect(recordsFor(html, 'career-import-form')).toHaveLength(1)
    expect(html).toContain('The uploaded file is not valid JSON.')
  })

  test('a JSON that is not a career dataset is refused with an actionable message', async () => {
    resetDatabase()
    const response = await uploadZip(
      harness(),
      new TextEncoder().encode(JSON.stringify({ schemaVersion: 4 })).buffer as ArrayBuffer,
      'backup.json',
    )
    expect(response.status).toBe(422)
    expect(await response.text()).toContain('is not a &quot;career-dataset&quot; dataset')
  })
})

describe('career export downloads', () => {
  test('the dataset download is the versioned career-dataset with its own marker', async () => {
    resetDatabase()
    seedSyntheticCareerData()
    const response = await harness().request('/career-data/transfer/export/dataset')
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Disposition')).toContain('career-dataset-full-')
    const payload = JSON.parse(await response.text()) as Record<string, unknown>
    expect(payload.format).toBe(careerDatasetFormat)
    expect(payload.schemaVersion).toBe(1)
  })

  test('the context download is parseable JSON that excludes contact details by default', async () => {
    resetDatabase()
    seedSyntheticCareerData()
    const response = await harness().request(
      '/career-data/transfer/export/context?direction=fullstack',
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Disposition')).toContain(
      'chatgpt-career-context-fullstack-',
    )
    const body = await response.text()
    const payload = JSON.parse(body) as Record<string, unknown>
    expect(payload.format).toBe('chatgpt-career-context')
    expect(body).not.toContain('jordan.rivera@example.test')
    expect(body).not.toContain('Edmonton')
    const identities = payload.sourceIdentities as { privacy: Record<string, boolean> }
    expect(identities.privacy).toEqual({
      includeSourceUrls: false,
      includeContactDetails: false,
    })
  })

  test('the context download includes contact details only when explicitly requested', async () => {
    resetDatabase()
    seedSyntheticCareerData()
    const response = await harness().request(
      '/career-data/transfer/export/context?direction=fullstack&includeContactDetails=on&includeSourceUrls=on',
    )
    const body = await response.text()
    expect(body).toContain('jordan.rivera@example.test')
    expect(body).toContain('Edmonton')
  })

  test('a direction without an approved Base Resume returns an actionable 422', async () => {
    resetDatabase()
    seedSyntheticCareerData()
    const response = await harness().request(
      '/career-data/transfer/export/context?direction=frontend',
    )
    expect(response.status).toBe(422)
    expect(await response.text()).toContain('no approved Base Resume')
  })

  test('the context preview fragment renders counts without the AppShell', async () => {
    resetDatabase()
    seedSyntheticCareerData()
    const response = await harness().request(
      '/career-data/transfer/export/context-preview?contextDirection=fullstack',
    )
    const html = await response.text()
    expect(response.status).toBe(200)
    expect(html).not.toContain('app-nav-toggle')
    expect(recordsFor(html, 'chatgpt-context-preview')).toHaveLength(1)
    expect(html).toContain('Private source URLs excluded')
    expect(html).toContain('Approved Base Resume')
  })

  test('nothing in the transfer tab performs a ChatGPT network call', async () => {
    const form = await Bun.file(
      new URL('../../app/components/career/ChatGptContextExportForm.tsx', import.meta.url),
    ).text()
    const route = await Bun.file(
      new URL('../../app/routes/career-data/transfer/export/context.tsx', import.meta.url),
    ).text()
    for (const source of [form, route]) {
      expect(source).not.toContain('fetch(')
      expect(source).not.toContain('api.openai.com')
      expect(source).not.toContain('XMLHttpRequest')
    }
  })
})
