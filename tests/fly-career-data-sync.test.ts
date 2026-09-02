import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import {
  chooseMachine,
  parseOptions,
  remoteUploadPaths,
  selectedFiles,
} from '../src/cli/sync-career-data-to-fly'

let fixtureRoot = ''

beforeAll(() => {
  fixtureRoot = mkdtempSync(resolve(tmpdir(), 'job-tracker-fly-sync-'))
  cpSync(resolve(process.cwd(), 'career-data.example'), resolve(fixtureRoot, 'career-data'), {
    recursive: true,
  })
  const baseResumes = resolve(fixtureRoot, 'career-data', 'base-resumes')
  mkdirSync(baseResumes, { recursive: true })
  writeFileSync(resolve(baseResumes, 'manifest.json'), '{"schemaVersion":1}\n')
  writeFileSync(resolve(baseResumes, 'fhir.md'), '# FHIR Base Resume\n')
})

afterAll(() => rmSync(fixtureRoot, { force: true, recursive: true }))

describe('Fly career data synchronization selection', () => {
  test('uploads the private career-data bundle by default', () => {
    const files = selectedFiles([], fixtureRoot)
    expect(files.some((file) => file.endsWith('/career-data/candidate.json'))).toBe(true)
    expect(files.some((file) => file.endsWith('/career-data/skill-taxonomy.json'))).toBe(true)
  })

  test('includes approved Base Resume Markdown and manifest with career data', () => {
    const files = selectedFiles(['career-data'], fixtureRoot)
    expect(files.some((file) => file.endsWith('/career-data/base-resumes/fhir.md'))).toBe(true)
    expect(files.some((file) => file.endsWith('/career-data/base-resumes/manifest.json'))).toBe(
      true,
    )

    const baseResumes = selectedFiles(['career-data/base-resumes'], fixtureRoot)
    expect(baseResumes.map((file) => file.split('/').pop()).sort()).toEqual([
      'fhir.md',
      'manifest.json',
    ])
  })

  test('allows one file or one bundle to be selected', () => {
    const one = selectedFiles(['career-data/skills.json'], fixtureRoot)
    expect(one).toHaveLength(1)
    expect(one[0]).toEndWith('/career-data/skills.json')
  })

  test('rejects files outside the private career-data bundle', () => {
    expect(() => selectedFiles(['package.json'], fixtureRoot)).toThrow('must be inside')
  })

  test('uploads through a unique temporary path before replacing an existing file', () => {
    const file = selectedFiles(['career-data/skills.json'], fixtureRoot)[0]
    expect(remoteUploadPaths(file, 'test-upload', fixtureRoot)).toEqual({
      destination: '/data/career-data/skills.json',
      temporary: '/data/career-data/skills.json.upload-test-upload',
    })
  })

  test('selects the only Fly Machine and rejects an ambiguous app', () => {
    expect(chooseMachine([{ id: 'machine-one', state: 'stopped' }])).toBe('machine-one')
    expect(() => chooseMachine([])).toThrow('no Machines')
    expect(() => chooseMachine([{ id: 'one' }, { id: 'two' }])).toThrow('--machine')
  })

  test('parses an explicit app, Machine, and post-upload DB sync', () => {
    expect(
      parseOptions([
        '--app',
        'job-hunting',
        '--machine',
        '807d47b7109368',
        '--sync-db',
        'career-data/skills.json',
      ]),
    ).toEqual({
      app: 'job-hunting',
      machine: '807d47b7109368',
      syncDb: true,
      selections: ['career-data/skills.json'],
    })
  })
})
