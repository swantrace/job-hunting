import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { DraftReview } from '../../app/components/workspace/DraftReview'

function harness(element: Parameters<typeof DraftReview>[0]) {
  const app = new Hono()
  app.get('/', (c) => c.html(<DraftReview {...element} />))
  return app.request('/')
}

describe('grounded draft review display', () => {
  test('escapes Markdown draft content as plain text', async () => {
    const response = await harness({
      resumeMarkdown: '## Summary\n\n<script>alert(1)</script> & bullets\n',
      coverLetterMarkdown: null,
      draftValidationJson: null,
    })
    const html = await response.text()

    expect(html).toContain('Resume draft (Markdown)')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>alert')
    expect(html).toContain('&amp;')
  })

  test('shows deterministic completeness warnings grouped by document', async () => {
    const response = await harness({
      resumeMarkdown: '## Summary\n\nA draft.\n',
      coverLetterMarkdown: null,
      draftValidationJson: JSON.stringify({
        resume: [{ code: 'missing-target-title', message: 'The exact target title is missing.' }],
        coverLetter: [{ code: 'repeated-salutation', message: 'The salutation appears twice.' }],
      }),
    })
    const html = await response.text()

    expect(html).toContain('Deterministic completeness checks')
    expect(html).toContain('missing-target-title')
    expect(html).toContain('repeated-salutation')
  })

  test('renders nothing when no Markdown drafts exist', async () => {
    const response = await harness({
      resumeMarkdown: null,
      coverLetterMarkdown: null,
      draftValidationJson: null,
    })
    expect((await response.text()).trim()).toBe('')
  })
})
