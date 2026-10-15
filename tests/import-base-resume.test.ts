import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import {
  approveBaseResume,
  baseResumeManifestFileName,
  loadBaseResumeManifest,
} from '../src/lib/base-resumes'

const knownProfiles = new Set(['fullstack', 'fhir', 'frontend'])

const dirs: string[] = []
function tempDir() {
  const dir = mkdtempSync(resolve(tmpdir(), 'job-tracker-import-base-resume-'))
  dirs.push(dir)
  return dir
}

function tempInputFile(content = '# Resume\n') {
  const dir = tempDir()
  const file = resolve(dir, 'resume.md')
  writeFileSync(file, content)
  return file
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { force: true, recursive: true })
})

describe('approveBaseResume', () => {
  test('writes the normalized Markdown and manifest and returns a fresh resume', () => {
    const dir = tempDir()
    const resume = approveBaseResume(dir, 'fhir', '# Fred\n\n## Summary\n\nEngineer.\n', {
      version: 'v1',
      knownDirectionIds: knownProfiles,
    })
    expect(resume.stale).toBe(false)
    expect(resume.empty).toBe(false)
    expect(existsSync(resolve(dir, 'fhir.md'))).toBe(true)
    expect(existsSync(resolve(dir, baseResumeManifestFileName))).toBe(true)

    // The filesystem store is import-only; read it back through the manifest
    // instead of the retired file-based runtime reader.
    const manifestEntry = loadBaseResumeManifest(dir, knownProfiles)?.resumes[0]
    expect(manifestEntry?.version).toBe('v1')
    expect(manifestEntry?.sha256).toBe(resume.sha256)
    expect(readFileSync(resolve(dir, 'fhir.md'), 'utf8')).toContain('Engineer.')
  })

  test('upserts an existing manifest entry and sorts by direction', () => {
    const dir = tempDir()
    approveBaseResume(dir, 'fhir', '# FHIR\n', { version: 'v1', knownDirectionIds: knownProfiles })
    const updated = approveBaseResume(dir, 'fhir', '# FHIR v2\n', {
      version: 'v2',
      knownDirectionIds: knownProfiles,
    })
    expect(updated.version).toBe('v2')
    const manifest = loadBaseResumeManifest(dir, knownProfiles)
    expect(manifest?.resumes).toHaveLength(1)
    expect(manifest?.resumes[0].version).toBe('v2')
  })

  test('rejects an empty resume and an unknown direction', () => {
    const dir = tempDir()
    expect(() =>
      approveBaseResume(dir, 'fhir', '  \n', { version: 'v1', knownDirectionIds: knownProfiles }),
    ).toThrow('is empty')
    expect(() =>
      approveBaseResume(dir, 'unknown', '# Hi\n', {
        version: 'v1',
        knownDirectionIds: knownProfiles,
      }),
    ).toThrow('not defined in preferences.directionDefinitions')
  })

  test('records the manifest JSON with a trailing newline', () => {
    const dir = tempDir()
    approveBaseResume(dir, 'fhir', '# FHIR\n', { version: 'v1', knownDirectionIds: knownProfiles })
    const raw = readFileSync(resolve(dir, baseResumeManifestFileName), 'utf8')
    expect(raw.endsWith('\n')).toBe(true)
    expect(JSON.parse(raw).resumes[0].direction).toBe('fhir')
  })
})
