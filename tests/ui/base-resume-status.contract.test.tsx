import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { BaseResumeStatus } from '../../app/components/BaseResumeStatus'
import { approvedBaseResumeMarkdown } from '../career/fixtures'
import { type CareerTestDatabase, careerTestDatabase } from '../support/career-db'

const markupText = '# Fred\n\n## Summary\n\nScript-free <markup> summary.\n'

let database: CareerTestDatabase

beforeAll(() => {
  database = careerTestDatabase()
  // Store a version whose content exercises HTML escaping. The version's digest
  // intentionally no longer matches, which also proves the stale marker.
  database.sqlite
    .query("UPDATE career_base_resumes SET markdown = ? WHERE direction_key = 'fullstack'")
    .run(markupText)
})

afterAll(() => {
  // Base Resume versions are immutable through the API, so restore the fixture
  // content directly to keep the shared test database clean.
  database.sqlite
    .query("UPDATE career_base_resumes SET markdown = ? WHERE direction_key = 'fullstack'")
    .run(approvedBaseResumeMarkdown)
  database.cleanup()
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
    // Drift is a content-hash mismatch now that approvals live in the database.
    expect(html).toContain('stale — content hash mismatch')
    expect(html).not.toContain('file changed')
    // Content is escaped, never interpreted as markup.
    expect(html).toContain('&lt;markup&gt;')
    expect(html).not.toContain('<markup>')
    expect(html).not.toMatch(/<AppShell|<html|<body/)
  })
})
