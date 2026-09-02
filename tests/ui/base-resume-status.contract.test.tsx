import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { Hono } from 'hono'
import { BaseResumeStatus } from '../../app/components/BaseResumeStatus'
import { baseResumeTextHash } from '../../src/lib/base-resumes'

let fixtureRoot = ''
const previous = {
  base: process.env.CAREER_BASE_RESUMES_DIR,
}

beforeAll(() => {
  fixtureRoot = mkdtempSync(resolve(tmpdir(), 'job-tracker-base-status-'))
  const baseDir = resolve(fixtureRoot, 'base-resumes')
  mkdirSync(baseDir, { recursive: true })
  process.env.CAREER_BASE_RESUMES_DIR = baseDir
  const text = '# Fred\n\n## Summary\n\nScript-free <markup> summary.\n'
  writeFileSync(
    resolve(baseDir, 'manifest.json'),
    `${JSON.stringify({
      schemaVersion: 1,
      lastUpdated: '2026-08-31',
      resumes: [
        {
          direction: 'fullstack',
          fileName: 'fullstack.md',
          version: 'v1',
          approvedAt: '2026-08-31',
          sha256: baseResumeTextHash(text),
        },
      ],
    })}\n`,
  )
  writeFileSync(resolve(baseDir, 'fullstack.md'), text)
})

afterAll(() => {
  rmSync(fixtureRoot, { force: true, recursive: true })
  if (previous.base === undefined) delete process.env.CAREER_BASE_RESUMES_DIR
  else process.env.CAREER_BASE_RESUMES_DIR = previous.base
})

describe('Base Resume readiness display', () => {
  test('shows version and lets the user view the approved content read-only', async () => {
    const app = new Hono()
    app.get('/', (c) => c.html(<BaseResumeStatus />))
    const response = await app.request('/')
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(html).toContain('Approved Base Resumes')
    expect(html).toContain('version v1')
    expect(html).toContain('View content')
    // Content is escaped, never interpreted as markup.
    expect(html).toContain('&lt;markup&gt;')
    expect(html).not.toContain('<markup>')
    expect(html).not.toMatch(/<AppShell|<html|<body/)
  })
})
