import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import {
  baseResumeManifestFileName,
  baseResumesDirectory,
  baseResumeTextHash,
  isEmptyBaseResume,
  loadApprovedBaseResume,
  loadBaseResumeManifest,
  normalizeBaseResumeText,
  parseBaseResumeManifest,
} from '../src/lib/career/base-resumes'
import { approvedBaseResumeMarkdown } from './career/fixtures'
import { createCareerTestDatabase } from './support/career-db'

const knownProfiles = new Set(['fullstack', 'fhir', 'frontend'])

const sampleResume = '# Fred\n\n## Summary\n\nSenior engineer.\n'
const manifest = {
  schemaVersion: 1,
  lastUpdated: '2026-08-31',
  resumes: [
    {
      direction: 'fhir',
      fileName: 'fhir.md',
      version: 'v1',
      approvedAt: '2026-08-31',
      sha256: baseResumeTextHash(sampleResume),
    },
  ],
}

let fixtureRoot = ''

beforeAll(() => {
  fixtureRoot = mkdtempSync(resolve(tmpdir(), 'job-tracker-base-resumes-'))
  writeFileSync(resolve(fixtureRoot, baseResumeManifestFileName), JSON.stringify(manifest))
  writeFileSync(resolve(fixtureRoot, 'fhir.md'), sampleResume)
})

afterAll(() => rmSync(fixtureRoot, { force: true, recursive: true }))

describe('Base Resume source authority', () => {
  test('defaults to career-data/base-resumes and honors explicit paths', () => {
    expect(baseResumesDirectory({})).toEndWith('/career-data/base-resumes')
    expect(baseResumesDirectory({ CAREER_DATA_DIR: '/data/career-data' })).toBe(
      '/data/career-data/base-resumes',
    )
    expect(baseResumesDirectory({ CAREER_BASE_RESUMES_DIR: '/tmp/base' })).toBe('/tmp/base')
  })

  test('normalizes line endings for hashing without changing wording', () => {
    expect(normalizeBaseResumeText('a\r\nb\rc\n')).toBe('a\nb\nc')
    expect(baseResumeTextHash('a\nb')).toBe(baseResumeTextHash('a\r\nb'))
    expect(isEmptyBaseResume('  \n\t ')).toBe(true)
    expect(isEmptyBaseResume('# Title')).toBe(false)
  })

  test('parses and validates a manifest against known profiles', () => {
    const parsed = parseBaseResumeManifest(manifest, knownProfiles)
    expect(parsed.resumes[0].direction).toBe('fhir')
    expect(() =>
      parseBaseResumeManifest(
        {
          ...manifest,
          resumes: [{ ...manifest.resumes[0], direction: 'nope', fileName: 'nope.md' }],
        },
        knownProfiles,
      ),
    ).toThrow('not defined in preferences.directionDefinitions')
  })

  test('rejects manifest file-name/direction mismatch and duplicate directions', () => {
    const mismatched = {
      ...manifest,
      resumes: [{ ...manifest.resumes[0], fileName: 'other.md' }],
    }
    expect(() => parseBaseResumeManifest(mismatched, knownProfiles)).toThrow('must be "fhir.md"')
    const duplicate = {
      ...manifest,
      resumes: [
        { ...manifest.resumes[0], direction: 'fullstack', fileName: 'fullstack.md' },
        { ...manifest.resumes[0], direction: 'fullstack', fileName: 'fullstack.md' },
      ],
    }
    expect(() => parseBaseResumeManifest(duplicate, knownProfiles)).toThrow('duplicate direction')
  })

  test('reads the selected approved resume from the database and detects a drifted hash', () => {
    const database = createCareerTestDatabase()
    try {
      const loaded = loadApprovedBaseResume('fullstack', knownProfiles, database.executor)
      expect(loaded?.version).toBe('v1')
      expect(loaded?.empty).toBe(false)
      expect(loaded?.stale).toBe(false)
      expect(loaded?.approvedSha256).toBe(baseResumeTextHash(approvedBaseResumeMarkdown))
      expect(loaded?.sha256).toBe(loaded?.approvedSha256)

      // A stored version is immutable through the API; simulate on-disk drift to
      // prove the reader compares the stored Markdown with its approved digest.
      database.sqlite
        .query("UPDATE career_base_resumes SET markdown = ? WHERE direction_key = 'fullstack'")
        .run(`${approvedBaseResumeMarkdown}\n## Certifications\n`)
      const changed = loadApprovedBaseResume('fullstack', knownProfiles, database.executor)
      expect(changed?.stale).toBe(true)
    } finally {
      database.cleanup()
    }
  })

  test('returns null for a direction without an approved version', () => {
    const database = createCareerTestDatabase()
    try {
      expect(loadApprovedBaseResume('fhir', knownProfiles, database.executor)).toBeNull()
      // A direction outside the known set disables generation for that direction.
      expect(loadApprovedBaseResume('fullstack', new Set(['fhir']), database.executor)).toBeNull()
      // An empty approved version cannot exist at all: the schema rejects it.
      expect(() =>
        database.sqlite
          .query(
            `INSERT INTO career_base_resumes
              (direction_key, version, status, markdown, content_hash, approved_at, revision, created_at, updated_at)
             VALUES ('fullstack', 'v-empty', 'draft', '   ', 'hash', NULL, 1, '2026-10-14', '2026-10-14')`,
          )
          .run(),
      ).toThrow()
    } finally {
      database.cleanup()
    }
  })

  test('returns null when no manifest exists', () => {
    expect(loadBaseResumeManifest(resolve(fixtureRoot, 'missing-dir'), knownProfiles)).toBeNull()
  })
})
