import { describe, expect, test } from 'bun:test'
import { documentReviewSystemPrompt } from '../../src/ai/prompts/document-review'
import { documentReviewSchema } from '../../src/ai/schemas/document-review'

describe('document review contract', () => {
  test('accepts controlled severity findings without rewriting documents', () => {
    const result = documentReviewSchema.safeParse({
      verdict: 'revise',
      summary: 'The documents are mostly clear with two minor concerns.',
      findings: [
        {
          severity: 'important',
          document: 'cross-document',
          category: 'cross-document-consistency',
          section: 'resume.summary',
          claim: 'production application experience',
          message: 'This phrasing is repeated verbatim in the cover letter.',
          recommendedAction: 'Keep the resume wording and make the letter add motivation.',
        },
        {
          severity: 'optional',
          document: 'cover-letter',
          category: 'targeting',
          section: 'coverLetter.companyInterestParagraph',
          claim: 'The role combines full-stack delivery',
          message: 'Consider grounding this in the reviewed JD wording.',
          recommendedAction: 'Name one concrete responsibility from the posting.',
        },
      ],
    })

    expect(result.success).toBe(true)
    expect(result.data?.findings).toHaveLength(2)
  })

  test('rejects uncontrolled severity values', () => {
    const result = documentReviewSchema.safeParse({
      verdict: 'revise',
      summary: 'ok',
      findings: [
        {
          severity: 'fatal',
          document: 'resume',
          category: 'truthfulness',
          section: 'x',
          claim: 'y',
          message: 'z',
          recommendedAction: 'Remove it.',
        },
      ],
    })

    expect(result.success).toBe(false)
  })

  test('keeps the review advisory and non-mutating in the prompt', () => {
    const prompt = documentReviewSystemPrompt.toLowerCase()
    expect(prompt).toMatch(/never silently rewrite/)
    expect(prompt).toMatch(/never.*career fact|never.*career data/)
    expect(prompt).toContain('top third')
    expect(prompt).toContain('complementary documents')
    expect(prompt).toContain('recommended')
  })
})
