import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { parseOptions } from '../src/cli/import-base-resume'
import {
  approveBaseResume,
  baseResumeManifestFileName,
  loadApprovedBaseResume,
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

describe('Base Resume import CLI', () => {
  test('parses direction, input, version, and output options', () => {
    const input = tempInputFile()
    const options = parseOptions(
      ['--direction', 'fhir', '--input', input, '--version', 'v2', '--output', '/tmp/base'],
      {},
    )
    expect(options.direction).toBe('fhir')
    expect(options.inputPath).toBe(input)
    expect(options.version).toBe('v2')
    expect(options.outputDirectory).toBe('/tmp/base')
  })

  test('requires a direction and input and validates the direction shape', () => {
    expect(() => parseOptions(['--input', tempInputFile()], {})).toThrow('--direction is required')
    expect(() =>
      parseOptions(['--direction', 'Not Valid!', '--input', tempInputFile()], {}),
    ).toThrow('Invalid direction')
  })

  test('defaults the output directory to the resolved base-resumes path', () => {
    const options = parseOptions(['--direction', 'fhir', '--input', tempInputFile()], {
      CAREER_BASE_RESUMES_DIR: '/tmp/custom-base',
    })
    expect(options.outputDirectory).toBe('/tmp/custom-base')
  })
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

    const reloaded = loadApprovedBaseResume(dir, 'fhir', knownProfiles)
    expect(reloaded?.version).toBe('v1')
    expect(reloaded?.stale).toBe(false)
    expect(reloaded?.sha256).toBe(resume.sha256)
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
