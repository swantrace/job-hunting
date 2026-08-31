import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { CareerDataGap } from '../../src/db/gap-queue'
import { fragmentRecords, recordsFor, renderJsx } from './support/html-contract'

function withExampleCareerData<T>(fn: () => T): T {
  const previousData = process.env.CAREER_DATA_DIR
  const previousProfiles = process.env.CAREER_PROFILES_DIR
  process.env.CAREER_DATA_DIR = resolve(process.cwd(), 'career-data.example')
  process.env.CAREER_PROFILES_DIR = resolve(process.cwd(), 'profiles.example')
  try {
    return fn()
  } finally {
    if (previousData === undefined) delete process.env.CAREER_DATA_DIR
    else process.env.CAREER_DATA_DIR = previousData
    if (previousProfiles === undefined) delete process.env.CAREER_PROFILES_DIR
    else process.env.CAREER_PROFILES_DIR = previousProfiles
  }
}

function gapFixture(overrides: Record<string, unknown> = {}): CareerDataGap {
  return {
    skillId: 1,
    skillName: 'Kafka',
    skillKey: 'kafka-test',
    category: null,
    aliases: ['Apache Kafka'],
    applicationCount: 1,
    requirementStatements: ['Experience with Kafka'],
    latestApplicationId: 7,
    latestApplicationTitle: 'Engineer',
    latestCompany: 'Acme',
    latestDecision: 'pending',
    latestIncludeReason: null,
    nowEvidenced: false,
    sources: [{ applicationId: 7, title: 'Engineer', company: 'Acme' }],
    ...overrides,
  }
}

describe('career data gap queue UI', () => {
  test('escapes skill names and requirement statements without raw HTML injection', async () => {
    await withExampleCareerData(async () => {
      const { CareerDataGapQueue } = await import('../../app/components/skills/CareerDataGapQueue')
      const html = await renderJsx(
        <CareerDataGapQueue
          gaps={[gapFixture({ skillName: '<script>alert(1)</script>' })]}
          filters={{ category: '', decision: '' }}
        />,
      )

      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
      expect(html).not.toContain('<script>alert(1)</script>')
    })
  })

  test('renders a neutral needs-evidence label, never a missing-skill claim', async () => {
    await withExampleCareerData(async () => {
      const { CareerDataGapQueue } = await import('../../app/components/skills/CareerDataGapQueue')
      const html = await renderJsx(
        <CareerDataGapQueue gaps={[gapFixture()]} filters={{ category: '', decision: '' }} />,
      )

      expect(html).toContain('Needs career-data evidence')
      expect(html).not.toMatch(/missing skill/i)
    })
  })

  test('renders a single stable #career-data-gap-queue fragment', async () => {
    await withExampleCareerData(async () => {
      const { CareerDataGapQueue } = await import('../../app/components/skills/CareerDataGapQueue')
      const html = await renderJsx(
        <CareerDataGapQueue gaps={[gapFixture()]} filters={{ category: '', decision: '' }} />,
      )
      const records = fragmentRecords(html)

      expect(recordsFor(html, 'career-data-gap-queue')).toEqual([
        expect.objectContaining({ depth: 0, id: 'career-data-gap-queue', oob: undefined }),
      ])
      expect(records.filter((record) => record.id === 'career-data-gap-queue')).toHaveLength(1)
    })
  })

  test('gap-queue fragment route returns a fragment without AppShell or a document', () => {
    const route = readFileSync(resolve(process.cwd(), 'app/routes/skills/gap-queue.tsx'), 'utf8')

    expect(route).toContain('CareerDataGapQueue')
    expect(route).toContain('c.html')
    expect(route).not.toMatch(/<AppShell|<html|<body/)
  })
})
