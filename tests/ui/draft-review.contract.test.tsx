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
      atsAuditJson: null,
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
        resume: [{ code: 'missing-section', message: 'The Skills section is missing.' }],
        coverLetter: [{ code: 'repeated-salutation', message: 'The salutation appears twice.' }],
      }),
      atsAuditJson: null,
    })
    const html = await response.text()

    expect(html).toContain('Deterministic completeness checks')
    expect(html).toContain('missing-section')
    expect(html).toContain('repeated-salutation')
  })

  test('shows the deterministic keyword audit of the generated text', async () => {
    const audit = {
      exactMatches: [{ canonical: 'TypeScript', matched: 'TypeScript' }],
      aliasMatches: [{ canonical: 'Node.js', matched: 'nodejs', alias: 'nodejs' }],
      missingButSupported: [{ canonical: 'Automated Testing', matched: 'Automated Testing' }],
      unsupportedTerms: [{ canonical: 'Kubernetes', matched: 'Kubernetes' }],
      repetitionWarnings: ['"TypeScript" appears 4 times.'],
      coverage: { matchedWeight: 4, totalWeight: 7, percentage: 57.142857 },
    }
    const response = await harness({
      resumeMarkdown: '## Summary\n\nA draft.\n',
      coverLetterMarkdown: null,
      draftValidationJson: null,
      atsAuditJson: JSON.stringify({ resume: audit, coverLetter: audit }),
    })
    const html = await response.text()

    expect(html).toContain('ATS keyword audit')
    expect(html).toContain('57% of weighted terms matched (4/7)')
    expect(html).toContain('Missing, safe to add (evidence supports it)')
    expect(html).toContain('Automated Testing')
    expect(html).toContain('Missing, no evidence — do not add')
    expect(html).toContain('Kubernetes')
    expect(html).toContain('TypeScript&quot; appears 4 times.')
    expect(html).toContain('Node.js — matched as &quot;nodejs&quot;')
  })

  test('renders nothing when no Markdown drafts exist', async () => {
    const response = await harness({
      resumeMarkdown: null,
      coverLetterMarkdown: null,
      draftValidationJson: null,
      atsAuditJson: null,
    })
    expect((await response.text()).trim()).toBe('')
  })
})
