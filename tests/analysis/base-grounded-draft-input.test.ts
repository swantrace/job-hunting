import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { baseResumeTextHash } from '../../src/lib/base-resumes'
import {
  baseResumeIdentity,
  baseResumeSourceFor,
  buildBaselineDocumentDraftSnapshot,
  buildDocumentDraftSnapshot,
} from '../../src/lib/document-draft-input'

const baseResumeText = '# Candidate\n\n## Summary\n\nSenior engineer.\n'

let fixtureRoot = ''
let baseResumesDir = ''
const previous = {
  data: process.env.CAREER_DATA_DIR,
  base: process.env.CAREER_BASE_RESUMES_DIR,
}

beforeAll(() => {
  fixtureRoot = mkdtempSync(resolve(tmpdir(), 'job-tracker-draft-input-'))
  baseResumesDir = resolve(fixtureRoot, 'base-resumes')
  process.env.CAREER_DATA_DIR = resolve(process.cwd(), 'career-data.example')
  process.env.CAREER_BASE_RESUMES_DIR = baseResumesDir
  mkdirSync(baseResumesDir, { recursive: true })
  writeFileSync(
    resolve(baseResumesDir, 'manifest.json'),
    `${JSON.stringify({
      schemaVersion: 1,
      lastUpdated: '2026-08-31',
      resumes: [
        {
          direction: 'fullstack',
          fileName: 'fullstack.md',
          version: 'v1',
          approvedAt: '2026-08-31',
          sha256: baseResumeTextHash(baseResumeText),
        },
      ],
    })}\n`,
  )
  writeFileSync(resolve(baseResumesDir, 'fullstack.md'), baseResumeText)
})

afterAll(() => {
  rmSync(fixtureRoot, { force: true, recursive: true })
  restoreEnv('CAREER_DATA_DIR', previous.data)
  restoreEnv('CAREER_BASE_RESUMES_DIR', previous.base)
})

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

const applicationSource = {
  application: {
    id: 1,
    direction: 'fullstack',
    jobTitle: 'Full-Stack Developer',
    location: 'Edmonton, AB',
    url: 'https://example.com/jobs/1',
  },
  company: { name: 'Example Company' },
  jobPosting: { contentHash: 'abc123', rawText: 'Build TypeScript products with FHIR.' },
  jobRequirements: [
    {
      sequence: 1,
      requirementType: 'skill',
      importance: 'required',
      basis: 'explicit',
      statement: 'TypeScript',
      sourceText: 'TypeScript',
    },
  ],
  requirements: [
    {
      skillName: 'TypeScript',
      importance: 'required',
      analysisResult: 'proven-match',
      decision: 'pending',
      decisionReason: null,
      rawLabel: 'TypeScript',
      requirementStatement: 'TypeScript',
    },
    {
      skillName: 'Kafka',
      importance: 'preferred',
      analysisResult: 'not-in-career-data',
      decision: 'skip',
      decisionReason: null,
      rawLabel: 'Kafka',
      requirementStatement: 'Kafka',
    },
  ],
}

describe('base-grounded document draft input', () => {
  test('exposes Base Resume identity for freshness without a filesystem path', () => {
    const identity = baseResumeIdentity('fullstack')
    expect(identity.baseResumeHash).toBe(baseResumeTextHash(baseResumeText))
    expect(identity.baseResumeVersion).toBe('v1')
    expect(baseResumeIdentity('fhir')).toEqual({ baseResumeHash: null, baseResumeVersion: null })
    expect(baseResumeSourceFor('fullstack')?.text).toContain('Senior engineer')
  })

  test('application snapshot combines JD, metadata, decisions, and complete safe career data', () => {
    const snapshot = buildDocumentDraftSnapshot(applicationSource)
    expect(snapshot.kind).toBe('application')
    expect(snapshot.baseResume?.direction).toBe('fullstack')
    expect(snapshot.application?.jobTitle).toBe('Full-Stack Developer')
    expect(snapshot.application?.company).toBe('Example Company')
    expect(snapshot.jobPosting?.rawText).toContain('FHIR')
    expect(snapshot.requirements.map((item) => item.skillName)).toEqual(['TypeScript'])
    expect(snapshot.excludedSkills).toContain('Kafka')
    expect(snapshot.direction).toBe('fullstack')
    expect(snapshot.careerData.experiences.length).toBeGreaterThan(0)
    expect(snapshot.careerData.skills.length).toBeGreaterThan(0)
  })

  test('baseline snapshot never invents an employer or a job description', () => {
    const snapshot = buildBaselineDocumentDraftSnapshot({
      direction: 'fullstack',
      targetTitle: 'Engineer',
    })
    expect(snapshot.kind).toBe('baseline')
    expect(snapshot.application).toBeNull()
    expect(snapshot.jobPosting).toBeNull()
    expect(snapshot.jobRequirements).toEqual([])
    expect(snapshot.requirements).toEqual([])
    expect(snapshot.baseResume?.direction).toBe('fullstack')
    expect(snapshot.careerData.experiences.length).toBeGreaterThan(0)
  })

  test('fails fast when the direction has no approved Base Resume', () => {
    expect(() =>
      buildDocumentDraftSnapshot({
        ...applicationSource,
        application: { ...applicationSource.application, direction: 'fhir' },
      }),
    ).toThrow('No approved Base Resume')
  })
})
