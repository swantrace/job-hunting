import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Filters } from '../../src/db/queries'
import { fragmentRecords, recordsFor, renderJsx } from './support/html-contract'

const filters: Filters = {
  attributes: '',
  priority: '',
  q: '',
  sort: 'updated_desc',
  statuses: '',
  today: '',
  view: 'list',
}

const run = {
  id: 1,
  jobPostingAnalysisId: 1,
  status: 'Completed',
  queueJobId: 'analysis-1',
  attempts: 0,
  inputHash: 'hash',
  inputSnapshotJson: null,
  resultJson: null,
  model: null,
  promptVersion: '1.1.0',
  schemaVersion: '1.1.0',
  errorMessage: null,
  recommendedProfileId: 'fullstack',
  confirmedProfileId: 'fullstack',
  profileConfirmedAt: '2026-01-01',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  startedAt: null,
  completedAt: '2026-01-01',
} as const

const draft = {
  positioning: 'Backend-leaning full-stack developer',
  primaryThemes: ['Distributed systems', 'API design'],
  emphasizeEvidenceIds: ['skill:typescript'],
  deemphasizeEvidenceIds: [],
} as const

describe('resume strategy UI', () => {
  test('renders one stable #resume-strategy fragment with a draft-prefilled form', async () => {
    const { ResumeStrategy } = await import('../../app/components/workspace/ResumeStrategy')
    const html = await renderJsx(
      <ResumeStrategy
        jobId={7}
        filters={filters}
        run={run as never}
        strategy={null}
        draft={draft as never}
        allowlist={['skill:typescript', 'skill:fhir']}
        canEdit
      />,
    )

    expect(recordsFor(html, 'resume-strategy')).toEqual([
      expect.objectContaining({ depth: 0, id: 'resume-strategy', oob: undefined }),
    ])
    expect(fragmentRecords(html).filter((record) => record.id === 'resume-strategy')).toHaveLength(
      1,
    )
    expect(html).toContain('hx-post="/applications/7/resume-strategy')
    expect(html).toContain('name="runId" value="1"')
    expect(html).toContain('Backend-leaning full-stack developer')
    expect(html).toContain('Distributed systems')
    expect(html).toContain('name="emphasizeEvidenceIds" value="skill:typescript"')
    expect(html).toContain('Save strategy')
    expect(html).not.toMatch(/missing skill/i)
  })

  test('explains that the strategy controls emphasis, not factual truth', async () => {
    const { ResumeStrategy } = await import('../../app/components/workspace/ResumeStrategy')
    const html = await renderJsx(
      <ResumeStrategy
        jobId={7}
        filters={filters}
        run={run as never}
        strategy={null}
        draft={draft as never}
        allowlist={[]}
        canEdit={false}
      />,
    )

    expect(html).toMatch(/emphasize/i)
    expect(html).toMatch(/not the factual truth/i)
    expect(html).toMatch(/Complete the current review/i)
  })
})

describe('resume strategy HTMX route', () => {
  test('returns a fragment, retargets 422s to #resume-strategy, and OOB-refreshes dependencies', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'app/routes/applications/[id]/resume-strategy.tsx'),
      'utf8',
    )

    expect(source).toContain("HX-Retarget', '#resume-strategy'")
    expect(source).toContain('c.html')
    expect(source).toContain('ResumeStrategy')
    expect(source).toContain('ReviewReadiness')
    expect(source).toContain('WorkspaceTabs')
    expect(source).toContain('GenerationPanel')
    expect(source).not.toMatch(/<AppShell|<html|<body/)
  })
})
