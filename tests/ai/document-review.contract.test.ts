import { describe, expect, test } from 'bun:test'
import { documentReviewSystemPrompt } from '../../src/ai/prompts/document-review'
import { documentReviewSchema } from '../../src/ai/schemas/document-review'

describe('document review contract', () => {
  test('accepts controlled severity findings without rewriting documents', () => {
    const result = documentReviewSchema.safeParse({
      summary: 'The documents are mostly clear with two minor concerns.',
      findings: [
        {
          severity: 'important',
          section: 'resume.summary',
          claim: 'production application experience',
          message: 'This phrasing is repeated verbatim in the cover letter.',
        },
        {
          severity: 'optional',
          section: 'coverLetter.companyInterestParagraph',
          claim: 'The role combines full-stack delivery',
          message: 'Consider grounding this in the reviewed JD wording.',
        },
      ],
    })

    expect(result.success).toBe(true)
    expect(result.data?.findings).toHaveLength(2)
  })

  test('rejects uncontrolled severity values', () => {
    const result = documentReviewSchema.safeParse({
      summary: 'ok',
      findings: [{ severity: 'fatal', section: 'x', claim: 'y', message: 'z' }],
    })

    expect(result.success).toBe(false)
  })

  test('keeps the review advisory and non-mutating in the prompt', () => {
    const prompt = documentReviewSystemPrompt.toLowerCase()
    expect(prompt).toMatch(/never silently rewrite/)
    expect(prompt).toMatch(/never.*career fact|never.*career data/)
  })
})
