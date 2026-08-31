import { describe, expect, test } from 'bun:test'
import PizZip from 'pizzip'
import { parseDocumentDraft } from '../../src/lib/document-draft'
import { renderCoverLetterDocx } from '../../src/lib/docx/cover-letter-renderer'
import { renderResumeDocx } from '../../src/lib/docx/resume-renderer'

const identity = {
  fullName: 'Jane Candidate',
  email: 'jane@example.com',
  phone: '+1 555 555 5555',
  location: 'Edmonton, AB',
  linkedin: 'https://www.linkedin.com/in/jane',
  github: 'https://github.com/jane',
  portfolio: 'https://jane.dev',
}

function resumeDraft() {
  return parseDocumentDraft(
    `## Summary\n\nFull-Stack Developer with R&D experience.\n\n## Skills\n\n- TypeScript\n- React\n\n## Experience\n\n- Built the [portal](https://example.com/portal).\n\n## Education\n\n- MSc Computer Science, Example University\n`,
    'resume',
  )
}

function letterDraft() {
  return parseDocumentDraft(
    `## Salutation\n\nHiring Team\n\n## Opening\n\nI am applying for the role.\n\n## Evidence\n\n- Shipped a production system.\n\n## Closing\n\nThank you.\n`,
    'cover-letter',
  )
}

async function documentXml(buffer: Buffer) {
  const zip = new PizZip(buffer)
  return zip.file('word/document.xml')?.asText() ?? ''
}

async function zipEntries(buffer: Buffer) {
  const zip = new PizZip(buffer)
  return Object.keys(zip.files)
}

describe('direct DOCX resume rendering', () => {
  test('produces a valid DOCX with text, headings, bullets, and no placeholders', async () => {
    const buffer = await renderResumeDocx(resumeDraft(), {
      identity,
      targetTitle: 'Full-Stack Developer',
    })
    expect(buffer.subarray(0, 2).toString()).toBe('PK')
    const xml = await documentXml(buffer)
    expect(xml).toContain('Jane Candidate')
    expect(xml).toContain('Full-Stack Developer')
    expect(xml).toContain('Summary')
    expect(xml).toContain('TypeScript')
    expect(xml).toContain('<w:numPr>')
    expect(xml).not.toContain('{{')
    expect(xml).not.toContain('}}')
    expect(xml).not.toContain('undefined')
    expect(xml).not.toContain('[object')
  })

  test('escapes special characters and renders safe links as hyperlinks', async () => {
    const buffer = await renderResumeDocx(resumeDraft(), {
      identity,
      targetTitle: 'Full-Stack Developer',
    })
    const xml = await documentXml(buffer)
    expect(xml).toContain('R&amp;D')
    expect(xml).toContain('<w:hyperlink')
    const entries = await zipEntries(buffer)
    expect(entries).toContain('word/_rels/document.xml.rels')
    const rels = new PizZip(buffer).file('word/_rels/document.xml.rels')?.asText() ?? ''
    expect(rels).toContain('https://example.com/portal')
  })

  test('emits the bullet numbering configuration', async () => {
    const buffer = await renderResumeDocx(resumeDraft(), {
      identity,
      targetTitle: 'Full-Stack Developer',
    })
    const numbering = new PizZip(buffer).file('word/numbering.xml')?.asText() ?? ''
    expect(numbering).toContain('bullet')
  })
})

describe('direct DOCX cover-letter rendering', () => {
  test('emits exactly one salutation and no duplicated Re:/Dear', async () => {
    const buffer = await renderCoverLetterDocx(letterDraft(), {
      identity,
      company: 'Example Company',
      date: '2026-08-31',
      targetTitle: 'Full-Stack Developer',
    })
    const xml = await documentXml(buffer)
    expect(xml).toContain('Dear Hiring Team,')
    expect((xml.match(/Dear Hiring Team/g) ?? []).length).toBe(1)
    expect(xml).not.toContain('Re:')
  })

  test('owns the date, company, and signature', async () => {
    const buffer = await renderCoverLetterDocx(letterDraft(), {
      identity,
      company: 'Example Company',
      date: '2026-08-31',
      targetTitle: 'Full-Stack Developer',
    })
    const xml = await documentXml(buffer)
    expect(xml).toContain('2026-08-31')
    expect(xml).toContain('Sincerely,')
    expect(xml).toContain('Jane Candidate')
    expect(xml).not.toContain('{{')
  })
})
