import { describe, expect, test } from 'bun:test'
import {
  collectDraftText,
  countDraftBullets,
  countDraftWords,
  isSafeLinkUrl,
  parseDocumentDraft,
  parseStoredDocumentDraft,
} from '../src/lib/document-draft'

const resume = `## Summary

Senior engineer with FHIR experience.

## Skills

- TypeScript
- FHIR

## Experience

- Built [the portal](https://example.com/portal) for a clinic.

## Education

- MSc Computer Science, Example University
`

describe('safe Markdown document parsing', () => {
  test('parses resume sections into a typed document model', () => {
    const draft = parseDocumentDraft(resume, 'resume')
    expect(draft.kind).toBe('resume')
    expect(draft.sections.map((section) => section.id)).toEqual([
      'summary',
      'skills',
      'experience',
      'education',
    ])
    expect(draft.sections[0].blocks[0]).toEqual({
      kind: 'paragraph',
      text: 'Senior engineer with FHIR experience.',
    })
    expect(draft.sections[1].blocks[0]).toEqual({ kind: 'bullet', text: 'TypeScript' })
  })

  test('accepts safe http(s) links and rejects unsafe schemes', () => {
    expect(isSafeLinkUrl('https://github.com/x')).toBe(true)
    expect(isSafeLinkUrl('http://example.com')).toBe(true)
    expect(isSafeLinkUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeLinkUrl('data:text/html,hi')).toBe(false)
    expect(() =>
      parseDocumentDraft('## Summary\n\n- [x](javascript:alert(1))\n', 'resume'),
    ).toThrow(/nsafe/)
  })

  test('accepts normal text containing colons and safe-scheme-like words', () => {
    // "data:", "file:", "about:" etc. are ordinary prose, not links; only markdown
    // link URLs are scheme-checked.
    const draft = parseDocumentDraft(
      '## Summary\n\nData: built ETL pipelines. About: see file: section.\n',
      'resume',
    )
    expect(draft.sections[0].blocks[0]).toEqual({
      kind: 'paragraph',
      text: 'Data: built ETL pipelines. About: see file: section.',
    })
  })

  test('rejects raw HTML, images, and executable schemes', () => {
    expect(() => parseDocumentDraft('## Summary\n\n<div>hi</div>\n', 'resume')).toThrow('Raw HTML')
    expect(() => parseDocumentDraft('## Summary\n\n<script>alert(1)</script>\n', 'resume')).toThrow(
      'Raw HTML',
    )
    expect(() =>
      parseDocumentDraft('## Summary\n\n![alt](https://x.com/i.png)\n', 'resume'),
    ).toThrow('Images are not allowed')
  })

  test('rejects unknown headings and non-H2 headings', () => {
    expect(() => parseDocumentDraft('## Hobbies\n\n- Chess\n', 'resume')).toThrow(
      'Unknown section heading',
    )
    expect(() => parseDocumentDraft('# Title\n\n## Summary\n\nHi\n', 'resume')).toThrow(
      'Only "##" section headings',
    )
  })

  test('rejects duplicate sections and content outside a section', () => {
    expect(() =>
      parseDocumentDraft('## Experience\n\n- A\n\n## Experience\n\n- B\n', 'resume'),
    ).toThrow('Duplicate section')
    expect(() => parseDocumentDraft('Stray text\n', 'resume')).toThrow('inside a "##" section')
  })

  test('parses cover-letter sections and counts budget metrics', () => {
    const letter = `## Salutation\n\nDear Hiring Team\n\n## Opening\n\nI am excited.\n\n## Closing\n\nThank you.\n`
    const draft = parseDocumentDraft(letter, 'cover-letter')
    expect(draft.sections.map((section) => section.id)).toEqual([
      'salutation',
      'opening',
      'closing',
    ])
    expect(collectDraftText(draft)).toContain('Dear Hiring Team')
    expect(countDraftBullets(parseDocumentDraft(resume, 'resume'))).toBe(4)
    expect(countDraftWords(parseDocumentDraft('## Summary\n\nOne two three.\n', 'resume'))).toBe(3)
  })

  test('round-trips a stored draft model', () => {
    const draft = parseDocumentDraft(resume, 'resume')
    const stored = JSON.parse(JSON.stringify(draft))
    expect(parseStoredDocumentDraft(stored)).toEqual(draft)
  })

  test('rejects a document with no sections', () => {
    expect(() => parseDocumentDraft('\n\n', 'resume')).toThrow('no sections')
  })
})
