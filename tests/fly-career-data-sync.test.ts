import { describe, expect, test } from 'bun:test'
import {
  chooseMachine,
  parseOptions,
  remoteUploadPaths,
  selectedFiles,
} from '../src/cli/sync-career-data-to-fly'

describe('Fly career data synchronization selection', () => {
  test('uploads both private data bundles by default', () => {
    const files = selectedFiles([])
    expect(files.some((file) => file.endsWith('/career-data/candidate.json'))).toBe(true)
    expect(files.some((file) => file.endsWith('/career-data/skill-taxonomy.json'))).toBe(true)
    expect(files.some((file) => file.endsWith('/profiles/fullstack.profile.json'))).toBe(true)
  })

  test('allows one file or one bundle to be selected', () => {
    const one = selectedFiles(['career-data/skills.json'])
    expect(one).toHaveLength(1)
    expect(one[0]).toEndWith('/career-data/skills.json')

    const profiles = selectedFiles(['profiles'])
    expect(profiles.length).toBeGreaterThanOrEqual(3)
    expect(profiles.every((file) => file.includes('/profiles/'))).toBe(true)
  })

  test('rejects files outside the private data bundles', () => {
    expect(() => selectedFiles(['package.json'])).toThrow('must be inside')
  })

  test('uploads through a unique temporary path before replacing an existing file', () => {
    const file = selectedFiles(['career-data/skills.json'])[0]
    expect(remoteUploadPaths(file, 'test-upload')).toEqual({
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
