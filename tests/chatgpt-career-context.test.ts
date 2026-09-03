import { describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { parseChatGptContextOptions } from '../src/cli/export-chatgpt-career-context'
import type { FrozenBaseResumeSource } from '../src/lib/base-resumes'
import { buildChatGptCareerContext } from '../src/lib/chatgpt-career-context'
import { loadExampleCareerData } from './support/career-data'

const resume: FrozenBaseResumeSource = {
  direction: 'fullstack',
  version: 'v1',
  approvedAt: '2026-09-01',
  sha256: 'a'.repeat(64),
  text: '# Example Candidate\n\n## Summary\n\nFull-stack developer.',
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
      direction: {
        id: 'fullstack',
        label: 'Full-Stack Developer',
        targetTitles: ['Full-Stack Developer'],
      },
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
      direction: {
        id: 'fullstack',
        label: 'Full-Stack Developer',
        targetTitles: ['Full-Stack Developer'],
      },
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

  test('selects repeatable directions and defaults output beside canonical data', () => {
    const careerDataDirectory = resolve(process.cwd(), 'career-data.example')
    expect(
      parseChatGptContextOptions(
        ['--direction', 'fhir', '--direction', 'frontend', '--direction', 'fhir'],
        { CAREER_DATA_DIR: careerDataDirectory },
      ),
    ).toEqual({
      directionIds: ['fhir', 'frontend'],
      outputDirectory: resolve(careerDataDirectory, 'chatgpt-context'),
    })
  })
})
