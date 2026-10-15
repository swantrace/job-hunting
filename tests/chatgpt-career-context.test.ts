import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import {
  exportChatGptCareerContexts,
  parseChatGptContextOptions,
} from '../src/cli/export-chatgpt-career-context'
import type { FrozenBaseResumeSource } from '../src/lib/base-resumes'
import type { CanonicalCareerData } from '../src/lib/career-data'
import { buildChatGptCareerContext } from '../src/lib/chatgpt-career-context'
import { loadExampleCareerData } from './support/career-data'
import { createCareerTestDatabase } from './support/career-db'

const resume: FrozenBaseResumeSource = {
  direction: 'fullstack',
  version: 'v1',
  approvedAt: '2026-09-01',
  sha256: 'a'.repeat(64),
  text: '# Example Candidate\n\n## Summary\n\nFull-stack developer.',
}

const direction = {
  id: 'fullstack',
  label: 'Full-Stack Developer',
  targetTitles: ['Full-Stack Developer'],
}

/** Adds a publication and a project whose private URLs must not leak by default. */
function withPrivateUrls(data: CanonicalCareerData): CanonicalCareerData {
  data.publications.publications.push({
    id: 'private-preprint',
    title: 'Private preprint',
    citation: 'Example, 2026.',
    year: 2026,
    publicationType: 'preprint',
    status: 'preprint',
    authors: [{ name: 'Example Candidate', isCandidate: true }],
    experienceId: null,
    projectIds: [],
    directions: ['fullstack'],
    contributions: [],
    sourceUrls: ['https://example.test/private-publication'],
    safeToUse: true,
  })
  data.projects.projects.push({
    id: 'private-project',
    name: 'Private project',
    skills: [],
    directions: ['fullstack'],
    urls: ['https://example.test/private-project'],
    eligibility: 'resume-eligible',
  })
  return data
}

describe('ChatGPT career context export', () => {
  test('combines an approved Base Resume with safe canonical facts and direction guidance', () => {
    const careerData = structuredClone(loadExampleCareerData())
    careerData.achievements.achievements.push({
      ...careerData.achievements.achievements[0],
      id: 'unsafe-example',
      claim: 'This claim must stay private.',
      safeToUse: false,
    })

    const markdown = buildChatGptCareerContext({
      careerData,
      direction,
      baseResume: resume,
    })

    expect(markdown).toContain('# Career Context — Full-Stack Developer')
    expect(markdown).toContain('Canonical Career Data is the factual authority')
    expect(markdown).toContain(resume.text)
    expect(markdown).toContain('example-delivery')
    expect(markdown).not.toContain('unsafe-example')
    expect(markdown).not.toContain('This claim must stay private.')
    expect(markdown).not.toContain(process.cwd())
  })

  test('is deterministic and rejects a Base Resume from another direction', () => {
    const careerData = loadExampleCareerData()
    const input = {
      careerData,
      direction,
      baseResume: resume,
    }
    expect(buildChatGptCareerContext(input)).toBe(buildChatGptCareerContext(input))
    expect(() =>
      buildChatGptCareerContext({
        ...input,
        baseResume: { ...resume, direction: 'frontend' },
      }),
    ).toThrow('does not match')
  })

  test('excludes private source URLs by default and tells the model not to invent them', () => {
    const careerData = withPrivateUrls(structuredClone(loadExampleCareerData()))
    const markdown = buildChatGptCareerContext({ careerData, direction, baseResume: resume })

    expect(markdown).not.toContain('https://example.test/private-publication')
    expect(markdown).not.toContain('https://example.test/private-project')
    expect(markdown).toContain('deliberately excluded from this file because they are private')
    expect(markdown).toContain('Do not invent, guess or reconstruct any URL')
    // The stored career record still keeps the private links.
    expect(careerData.publications.publications[0]?.sourceUrls).toEqual([
      'https://example.test/private-publication',
    ])
    expect(
      careerData.projects.projects.find((item) => item.id === 'private-project')?.urls,
    ).toEqual(['https://example.test/private-project'])
  })

  test('includes the private source URLs only when the export opts in', () => {
    const careerData = withPrivateUrls(structuredClone(loadExampleCareerData()))
    const markdown = buildChatGptCareerContext({
      careerData,
      direction,
      baseResume: resume,
      includeSourceUrls: true,
    })

    expect(markdown).toContain('https://example.test/private-publication')
    expect(markdown).toContain('https://example.test/private-project')
    expect(markdown).not.toContain('deliberately excluded from this file because they are private')
  })

  test('selects repeatable directions and defaults output to a repository-relative directory', () => {
    const careerDataDirectory = resolve(process.cwd(), 'career-data.example')
    expect(
      parseChatGptContextOptions(
        ['--direction', 'fhir', '--direction', 'frontend', '--direction', 'fhir'],
        { CAREER_DATA_DIR: careerDataDirectory },
      ),
    ).toEqual({
      directionIds: ['fhir', 'frontend'],
      outputDirectory: resolve(process.cwd(), 'chatgpt-context'),
      includeSourceUrls: false,
    })
    expect(
      parseChatGptContextOptions(['--include-source-urls'], {
        CAREER_DATA_DIR: careerDataDirectory,
      }),
    ).toMatchObject({ includeSourceUrls: true })
  })
})

describe('ChatGPT career context CLI (database-backed)', () => {
  test('writes one valid JSON context per direction from the database', () => {
    const database = createCareerTestDatabase()
    const outputDirectory = mkdtempSync(resolve(tmpdir(), 'job-tracker-context-cli-'))
    try {
      const paths = exportChatGptCareerContexts(
        { directionIds: [], outputDirectory, includeSourceUrls: false },
        database.executor,
      )
      expect(paths).toHaveLength(1)
      expect(paths[0]).toBe(resolve(outputDirectory, 'fullstack.json'))
      const payload = JSON.parse(readFileSync(paths[0] as string, 'utf8')) as Record<
        string,
        unknown
      >
      expect(payload.format).toBe('chatgpt-career-context')
      expect((payload.sourceIdentities as { baseResumes: unknown[] }).baseResumes).toHaveLength(1)
      expect(readFileSync(paths[0] as string, 'utf8')).not.toContain('jordan.rivera@example.test')
    } finally {
      rmSync(outputDirectory, { force: true, recursive: true })
      database.cleanup()
    }
  })

  test('an unknown direction is refused before anything is written', () => {
    const database = createCareerTestDatabase()
    const outputDirectory = mkdtempSync(resolve(tmpdir(), 'job-tracker-context-cli-'))
    try {
      expect(() =>
        exportChatGptCareerContexts(
          { directionIds: ['not-a-direction'], outputDirectory, includeSourceUrls: false },
          database.executor,
        ),
      ).toThrow('not defined in the career database')
    } finally {
      rmSync(outputDirectory, { force: true, recursive: true })
      database.cleanup()
    }
  })
})
