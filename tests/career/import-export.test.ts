import type { Database } from 'bun:sqlite'
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { selectedApprovedBaseResume } from '../../src/db/career-base-resumes'
import { createCareerDirection } from '../../src/db/career-directions'
import { careerContentProbe, stableFingerprint } from '../../src/db/career-shared'
import * as schema from '../../src/db/schema'
import { baseResumeTextHash } from '../../src/lib/career/base-resumes'
import { buildCareerDataset, serializeCareerDataset } from '../../src/lib/career/export'
import {
  applyCareerImport,
  CareerImportConflictError,
  CareerImportStaleError,
  prepareCareerImport,
} from '../../src/lib/career/import'
import { migratedDatabase } from '../support/sqlite'
import {
  approvedBaseResumeManifest,
  approvedBaseResumeMarkdown,
  documentsWithAmbiguousAlias,
  syntheticCareerDocuments,
  writeCareerDocuments,
  writeSyntheticCareerData,
} from './fixtures'

/**
 * acceptance: transactional directory/dataset import and dataset export.
 *
 * Every database is an isolated in-memory SQLite migrated from `drizzle/`; no
 * test touches the developer's `jobs.db`. Imports always receive the explicit
 * executor built here, never the module-level default.
 */

const openDatabases: Database[] = []
const temporaryDirectories: string[] = []

afterEach(() => {
  while (openDatabases.length > 0) openDatabases.pop()?.close()
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function database() {
  const sqlite = migratedDatabase()
  openDatabases.push(sqlite)
  return { sqlite, db: drizzle({ client: sqlite, schema }) }
}

type TestDb = ReturnType<typeof database>['db']

function temporaryDirectory(populate: (directory: string) => void): string {
  const root = mkdtempSync(resolve(tmpdir(), 'career-import-test-'))
  temporaryDirectories.push(root)
  const directory = resolve(root, 'career-data')
  mkdirSync(directory, { recursive: true })
  populate(directory)
  return directory
}

function writeBaseResumes(directory: string, manifest: unknown, files: Record<string, string>) {
  const baseDirectory = resolve(directory, 'base-resumes')
  mkdirSync(baseDirectory, { recursive: true })
  writeFileSync(resolve(baseDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(resolve(baseDirectory, name), text)
  }
}

function rowCount(sqlite: Database, table: string): number {
  return (sqlite.query(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count
}

/** Export identity, ignoring the volatile `exportedAt` stamp. */
function canonical(dataset: unknown) {
  return stableFingerprint({ ...(dataset as Record<string, unknown>), exportedAt: undefined })
}

/**
 * Wraps the real executor so an insert into `career_achievements` throws. The
 * write is reached only after several other records were already written, which
 * proves the whole apply is one transaction.
 */
function failingExecutor(real: TestDb): TestDb {
  const wrap = (tx: unknown): unknown =>
    new Proxy(tx as object, {
      get(target, prop, receiver) {
        if (prop === 'transaction') {
          return (callback: (inner: unknown) => unknown) =>
            (target as { transaction: (cb: (inner: unknown) => unknown) => unknown }).transaction(
              (inner) => callback(wrap(inner)),
            )
        }
        if (prop === 'insert' || prop === 'update' || prop === 'delete') {
          return (table: unknown) => {
            if (table === schema.careerAchievements) throw new Error('injected import failure')
            return (target as Record<string, (arg: unknown) => unknown>)[prop](table)
          }
        }
        const value = Reflect.get(target, prop, receiver)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
  return new Proxy(real as object, {
    get(target, prop, receiver) {
      if (prop === 'transaction') {
        return (callback: (inner: unknown) => unknown) =>
          (target as { transaction: (cb: (inner: unknown) => unknown) => unknown }).transaction(
            (tx) => callback(wrap(tx)),
          )
      }
      const value = Reflect.get(target, prop, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    },
  }) as unknown as TestDb
}

describe('career dataset import and export', () => {
  test('1. directory import inserts every synthetic fact and reports counts per kind', () => {
    const { sqlite, db } = database()
    const directory = temporaryDirectory((dir) => writeSyntheticCareerData(dir))

    const preview = prepareCareerImport(db, { kind: 'directory', directory })
    expect(preview.conflicts).toEqual([])
    expect(preview.databaseRevision).toBe(careerContentProbe(db))

    const report = applyCareerImport(db, preview)
    expect(report.byKind.catalog).toEqual({ inserted: 5, updated: 0, unchanged: 0 })
    expect(report.byKind.education).toEqual({ inserted: 2, updated: 0, unchanged: 0 })
    expect(report.byKind.experiences).toEqual({ inserted: 2, updated: 0, unchanged: 0 })
    expect(report.byKind.achievements).toEqual({ inserted: 2, updated: 0, unchanged: 0 })
    expect(report.byKind.projects).toEqual({ inserted: 1, updated: 0, unchanged: 0 })
    expect(report.byKind.stories).toEqual({ inserted: 1, updated: 0, unchanged: 0 })
    expect(report.byKind.publications).toEqual({ inserted: 1, updated: 0, unchanged: 0 })
    expect(report.byKind.personalSkills).toEqual({ inserted: 5, updated: 0, unchanged: 0 })
    expect(report.byKind.directions).toEqual({ inserted: 3, updated: 0, unchanged: 0 })
    expect(report.byKind.candidate).toEqual({ inserted: 1, updated: 0, unchanged: 0 })
    expect(report.byKind.preferences).toEqual({ inserted: 1, updated: 0, unchanged: 0 })

    expect(rowCount(sqlite, 'career_education')).toBe(2)
    expect(rowCount(sqlite, 'career_experiences')).toBe(2)
    expect(rowCount(sqlite, 'career_achievements')).toBe(2)
    expect(rowCount(sqlite, 'career_projects')).toBe(1)
    expect(rowCount(sqlite, 'career_stories')).toBe(1)
    expect(rowCount(sqlite, 'career_publications')).toBe(1)
    expect(rowCount(sqlite, 'career_skills')).toBe(5)
    expect(rowCount(sqlite, 'career_directions')).toBe(3)
    expect(rowCount(sqlite, 'career_profile')).toBe(1)
  })

  test('2. a repeat import is a no-op and does not change the change probe', () => {
    const { db } = database()
    const directory = temporaryDirectory((dir) => writeSyntheticCareerData(dir))
    applyCareerImport(db, prepareCareerImport(db, { kind: 'directory', directory }))
    const probe = careerContentProbe(db)
    expect(probe).not.toBe('')

    const preview = prepareCareerImport(db, { kind: 'directory', directory })
    expect(preview.conflicts).toEqual([])
    const report = applyCareerImport(db, preview)
    expect(report.inserted).toBe(0)
    expect(report.updated).toBe(0)
    expect(report.unchanged).toBe(preview.report.unchanged)
    expect(report.unchanged).toBeGreaterThan(0)
    expect(careerContentProbe(db)).toBe(probe)
  })

  test('3. an ambiguous catalog alias blocks with a conflict and writes nothing', () => {
    const { sqlite, db } = database()
    const directory = temporaryDirectory((dir) =>
      writeCareerDocuments(dir, documentsWithAmbiguousAlias()),
    )

    const preview = prepareCareerImport(db, { kind: 'directory', directory })
    expect(preview.conflicts.join('\n')).toContain('REST APIs')
    expect(() => applyCareerImport(db, preview)).toThrow(CareerImportConflictError)
    expect(rowCount(sqlite, 'skills')).toBe(0)
    expect(rowCount(sqlite, 'career_education')).toBe(0)
    expect(rowCount(sqlite, 'career_directions')).toBe(0)
  })

  test('4. an unknown reference is a conflict, fabricates nothing and writes nothing', () => {
    const { sqlite, db } = database()
    const documents = structuredClone(syntheticCareerDocuments)
    const achievements = documents['achievements.json'] as {
      achievements: Array<Record<string, unknown>>
    }
    achievements.achievements[0].experienceId = 'absent-experience'
    const directory = temporaryDirectory((dir) => writeCareerDocuments(dir, documents))

    const preview = prepareCareerImport(db, { kind: 'directory', directory })
    expect(preview.conflicts.join('\n')).toContain('absent-experience')
    expect(() => applyCareerImport(db, preview)).toThrow(CareerImportConflictError)
    expect(rowCount(sqlite, 'career_experiences')).toBe(0)
    expect(rowCount(sqlite, 'career_achievements')).toBe(0)
    expect(rowCount(sqlite, 'skills')).toBe(0)
  })

  test('5. export -> import into a fresh database -> re-export is lossless', () => {
    const first = database()
    const directory = temporaryDirectory((dir) => writeSyntheticCareerData(dir))
    const firstPreview = prepareCareerImport(first.db, { kind: 'directory', directory })
    expect(firstPreview.conflicts).toEqual([])
    applyCareerImport(first.db, firstPreview)
    const firstDataset = buildCareerDataset(first.db)

    // Education fields the old strict schema silently stripped.
    const degree = firstDataset.education.find((row) => row.stableKey === 'edu-example-degree')
    expect(degree?.datePrecision).toBe('month')
    expect(degree?.coursework).toEqual(['Distributed Systems', 'Database Systems'])
    expect(degree?.details).toBe('Synthetic coursework fixture.')
    // Unknown keys on records the relational schema cannot express.
    expect(
      firstDataset.experiences.find((row) => row.stableKey === 'northwind-analytics')?.extensions
        ?.extensionMetadata,
    ).toEqual({ syntheticImportSource: 'fixture' })
    expect(firstDataset.publications[0].extensions?.publicationType).toBe('preprint')
    expect(
      firstDataset.personalSkills.find((row) => row.skillKey === 'typescript')?.extensions
        ?.directions,
    ).toEqual(['fullstack', 'frontend'])

    const second = database()
    const payload = JSON.parse(serializeCareerDataset(firstDataset)) as unknown
    const secondPreview = prepareCareerImport(second.db, { kind: 'dataset', json: payload })
    expect(secondPreview.conflicts).toEqual([])
    applyCareerImport(second.db, secondPreview)
    const secondDataset = buildCareerDataset(second.db)

    expect(canonical(secondDataset)).toBe(canonical(firstDataset))
  })

  test('6. the export excludes credentials, application history and artifact binaries', () => {
    const { sqlite, db } = database()
    sqlite
      .query(
        `INSERT INTO google_drive_connections (id, refresh_token_encrypted, folder_id, created_at, updated_at)
     VALUES (1, 'refresh-token-secret-marker', 'folder-secret-marker', 'T', 'T')`,
      )
      .run()
    sqlite
      .query(
        `INSERT INTO companies (name, created_at, updated_at)
     VALUES ('Application History Secret Co', 'T', 'T')`,
      )
      .run()

    const directory = temporaryDirectory((dir) => writeSyntheticCareerData(dir))
    applyCareerImport(db, prepareCareerImport(db, { kind: 'directory', directory }))

    const dataset = buildCareerDataset(db)
    const json = serializeCareerDataset(dataset)
    expect(json).not.toContain('refresh-token-secret-marker')
    expect(json).not.toContain('folder-secret-marker')
    expect(json).not.toContain('Application History Secret Co')
    expect(json).not.toContain('google_drive_connections')
    expect(dataset.excluded.kinds).toContain('oauth-credentials')
    expect(dataset.excluded.reason).toContain('SQLite backup')
  })

  test('7. Base Resume digest, approval selection and empty bodies are enforced', () => {
    const { db } = database()

    const mismatchDirectory = temporaryDirectory((dir) => {
      writeSyntheticCareerData(dir)
      const manifest = approvedBaseResumeManifest()
      writeBaseResumes(
        dir,
        { ...manifest, resumes: [{ ...manifest.resumes[0], sha256: '0'.repeat(64) }] },
        { 'fullstack.md': approvedBaseResumeMarkdown },
      )
    })
    const mismatch = prepareCareerImport(db, { kind: 'directory', directory: mismatchDirectory })
    expect(mismatch.conflicts.join('\n')).toContain('digest')
    expect(() => applyCareerImport(db, mismatch)).toThrow(CareerImportConflictError)

    const validDirectory = temporaryDirectory((dir) => {
      writeSyntheticCareerData(dir)
      writeBaseResumes(dir, approvedBaseResumeManifest(), {
        'fullstack.md': approvedBaseResumeMarkdown,
      })
    })
    const valid = prepareCareerImport(db, { kind: 'directory', directory: validDirectory })
    expect(valid.conflicts).toEqual([])
    applyCareerImport(db, valid)
    const selected = selectedApprovedBaseResume(db, 'fullstack')
    expect(selected?.status).toBe('approved')
    expect(selected?.contentHash).toBe(baseResumeTextHash(approvedBaseResumeMarkdown))
    expect(selected?.markdown).toBe(approvedBaseResumeMarkdown)

    const emptyDirectory = temporaryDirectory((dir) => {
      writeSyntheticCareerData(dir)
      writeBaseResumes(dir, approvedBaseResumeManifest(), { 'fullstack.md': '' })
    })
    const empty = prepareCareerImport(db, { kind: 'directory', directory: emptyDirectory })
    expect(empty.conflicts.join('\n')).toContain('empty')
    expect(() => applyCareerImport(db, empty)).toThrow(CareerImportConflictError)
  })

  test('8. a stale preview is rejected when the source or the database changed', () => {
    const changedDatabase = database()
    const directory = temporaryDirectory((dir) => writeSyntheticCareerData(dir))
    const preview = prepareCareerImport(changedDatabase.db, { kind: 'directory', directory })
    expect(preview.conflicts).toEqual([])
    createCareerDirection(changedDatabase.db, {
      key: 'stale-extra',
      label: 'Stale Extra',
      targetTitles: ['Stale Extra'],
    })
    expect(() => applyCareerImport(changedDatabase.db, preview)).toThrow(CareerImportStaleError)

    const changedSource = database()
    const sourceDirectory = temporaryDirectory((dir) => writeSyntheticCareerData(dir))
    const sourcePreview = prepareCareerImport(changedSource.db, {
      kind: 'directory',
      directory: sourceDirectory,
    })
    writeCareerDocuments(sourceDirectory, documentsWithAmbiguousAlias())
    expect(() => applyCareerImport(changedSource.db, sourcePreview)).toThrow(CareerImportStaleError)
  })

  test('9. records missing from the source are never deleted', () => {
    const { sqlite, db } = database()
    const directory = temporaryDirectory((dir) => writeSyntheticCareerData(dir))
    applyCareerImport(db, prepareCareerImport(db, { kind: 'directory', directory }))
    expect(rowCount(sqlite, 'career_experiences')).toBe(2)

    const reduced = structuredClone(syntheticCareerDocuments)
    const experiences = reduced['experiences.json'] as { experiences: Array<{ id: string }> }
    experiences.experiences = experiences.experiences.filter((row) => row.id !== 'contoso-health')
    writeCareerDocuments(directory, reduced)

    const preview = prepareCareerImport(db, { kind: 'directory', directory })
    expect(preview.conflicts).toEqual([])
    const report = applyCareerImport(db, preview)
    expect(report.inserted).toBe(0)
    expect(rowCount(sqlite, 'career_experiences')).toBe(2)
    expect(
      sqlite
        .query(
          "SELECT COUNT(*) AS count FROM career_experiences WHERE stable_key = 'contoso-health'",
        )
        .get(),
    ).toEqual({ count: 1 })
  })

  test('10. a failure during apply rolls the whole import back', () => {
    const { sqlite, db } = database()
    const directory = temporaryDirectory((dir) => writeSyntheticCareerData(dir))
    const preview = prepareCareerImport(db, { kind: 'directory', directory })
    expect(preview.conflicts).toEqual([])

    const tables = [
      'career_education',
      'career_experiences',
      'career_achievements',
      'career_projects',
      'career_stories',
      'career_publications',
      'career_skills',
      'career_directions',
      'career_record_directions',
      'career_profile',
      'skills',
      'skill_aliases',
    ]
    const before = tables.map((table) => rowCount(sqlite, table))
    const probeBefore = careerContentProbe(db)
    expect(before.every((count) => count === 0)).toBe(true)

    expect(() => applyCareerImport(failingExecutor(db), preview)).toThrow('injected import failure')

    expect(careerContentProbe(db)).toBe(probeBefore)
    expect(tables.map((table) => rowCount(sqlite, table))).toEqual(before)
  })

  test('11. a legacy dataset carrying the removed state archive still imports', () => {
    const source = database()
    const directory = temporaryDirectory((dir) => writeSyntheticCareerData(dir))
    applyCareerImport(source.db, prepareCareerImport(source.db, { kind: 'directory', directory }))
    const dataset = buildCareerDataset(source.db) as Record<string, unknown>

    // A pre-0029 export: it has `state.legacyDocuments`/`state.extensions` and
    // no `documents`. The importer must ignore the removed archive and still
    // apply the rest without error.
    const legacy: Record<string, unknown> = {
      ...dataset,
      state: {
        legacyDocuments: { 'candidate.json': { identity: { fullName: 'Legacy' } } },
        extensions: { someDocument: { kept: true } },
      },
    }
    delete legacy.documents

    const target = database()
    const preview = prepareCareerImport(target.db, { kind: 'dataset', json: legacy })
    expect(preview.conflicts).toEqual([])
    const report = applyCareerImport(target.db, preview)
    expect(report.inserted).toBeGreaterThan(0)
    expect(rowCount(target.sqlite, 'career_education')).toBe(2)
    expect(rowCount(target.sqlite, 'career_experiences')).toBe(2)
  })
})
