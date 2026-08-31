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
} from '../src/lib/base-resumes'

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
    ).toThrow('not an existing profile')
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

  test('loads an approved resume and detects a stale hash', () => {
    const loaded = loadApprovedBaseResume(fixtureRoot, 'fhir', knownProfiles)
    expect(loaded?.version).toBe('v1')
    expect(loaded?.empty).toBe(false)
    expect(loaded?.stale).toBe(false)
    expect(loaded?.sha256).toBe(manifest.resumes[0].sha256)

    writeFileSync(resolve(fixtureRoot, 'fhir.md'), `${sampleResume}## Certifications\n\n- CHL7\n`)
    const changed = loadApprovedBaseResume(fixtureRoot, 'fhir', knownProfiles)
    expect(changed?.stale).toBe(true)
    writeFileSync(resolve(fixtureRoot, 'fhir.md'), sampleResume)
  })

  test('returns null for a missing direction and rejects an empty file', () => {
    expect(loadApprovedBaseResume(fixtureRoot, 'fullstack', knownProfiles)).toBeNull()
    const emptyManifest = {
      ...manifest,
      resumes: [{ ...manifest.resumes[0], direction: 'fullstack', fileName: 'fullstack.md' }],
    }
    writeFileSync(resolve(fixtureRoot, baseResumeManifestFileName), JSON.stringify(emptyManifest))
    writeFileSync(resolve(fixtureRoot, 'fullstack.md'), '   \n')
    expect(() => loadApprovedBaseResume(fixtureRoot, 'fullstack', knownProfiles)).toThrow(
      'is empty',
    )
    writeFileSync(resolve(fixtureRoot, baseResumeManifestFileName), JSON.stringify(manifest))
  })

  test('returns null when no manifest exists', () => {
    expect(loadBaseResumeManifest(resolve(fixtureRoot, 'missing-dir'), knownProfiles)).toBeNull()
  })
})
