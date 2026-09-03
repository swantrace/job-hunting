import { z } from 'zod'

/**
 * Safe Markdown-to-typed-document-model parser.
 *
 * The LLM writes Markdown using a controlled section vocabulary; code owns the
 * Word layout. This parser accepts only plain text and safe `http(s)` links,
 * rejects raw HTML, images, executable/unsafe link schemes, unknown headings,
 * and duplicate sections. List and section counts are bounded so a runaway
 * model output fails the run instead of entering a document.
 */

export const documentKinds = ['resume', 'cover-letter'] as const
export type DocumentKind = (typeof documentKinds)[number]

export const resumeSectionIds = [
  'summary',
  'skills',
  'experience',
  'projects',
  'publications',
  'education',
] as const
export type ResumeSectionId = (typeof resumeSectionIds)[number]

export const coverLetterSectionIds = [
  'salutation',
  'opening',
  'evidence',
  'company-interest',
  'authorization',
  'closing',
] as const
export type CoverLetterSectionId = (typeof coverLetterSectionIds)[number]

export type DocumentSectionId = ResumeSectionId | CoverLetterSectionId

export type DocumentParagraph = { kind: 'paragraph'; text: string }
export type DocumentBullet = { kind: 'bullet'; text: string }
export type DocumentBlock = DocumentParagraph | DocumentBullet

export type DocumentSection = {
  id: DocumentSectionId
  heading: string
  blocks: DocumentBlock[]
}

export type DocumentDraft = {
  kind: DocumentKind
  sections: DocumentSection[]
}

export const draftSchemaVersion = '2.0.0'

const headingToSection: Record<DocumentKind, Record<string, DocumentSectionId>> = {
  resume: {
    summary: 'summary',
    skills: 'skills',
    experience: 'experience',
    projects: 'projects',
    publications: 'publications',
    education: 'education',
  },
  'cover-letter': {
    salutation: 'salutation',
    opening: 'opening',
    evidence: 'evidence',
    'company interest': 'company-interest',
    authorization: 'authorization',
    closing: 'closing',
  },
}

const MAX_SECTIONS = 12
const MAX_BLOCKS_PER_SECTION = 40
const MAX_TEXT_LENGTH = 2000

export class DocumentDraftParseError extends Error {
  constructor(
    message: string,
    readonly line?: number,
  ) {
    super(line === undefined ? message : `${message} (line ${line})`)
    this.name = 'DocumentDraftParseError'
  }
}

const rawHtmlPattern = /<\/?[a-z][a-z0-9-]*(?:\s[^<>]*)?>/i
const markdownLinkPattern = /\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+["'][^"']*["'])?\s*\)/g
const headingPattern = /^(#{1,6})\s+(.+)$/
const bulletPattern = /^\s*[-*+]\s+/

/** Only `http(s)` links are safe document content. */
export function isSafeLinkUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:'
}

function assertSafeLine(line: string, lineNumber: number) {
  if (rawHtmlPattern.test(line))
    throw new DocumentDraftParseError('Raw HTML is not allowed in document drafts.', lineNumber)
  if (line.startsWith('!['))
    throw new DocumentDraftParseError('Images are not allowed in document drafts.', lineNumber)
  for (const match of line.matchAll(markdownLinkPattern)) {
    if (!isSafeLinkUrl(match[2]))
      throw new DocumentDraftParseError(`Unsafe link URL "${match[2]}".`, lineNumber)
  }
}

function sectionIdForHeading(kind: DocumentKind, heading: string): DocumentSectionId | null {
  const key = heading.trim().toLowerCase()
  return headingToSection[kind][key] ?? null
}

/**
 * Parses a resume or cover-letter Markdown draft into a typed document model.
 * Sections must use `##` headings from the controlled vocabulary; any other
 * heading, unknown heading, or duplicate section is rejected.
 */
export function parseDocumentDraft(markdown: string, kind: DocumentKind): DocumentDraft {
  const sections: DocumentSection[] = []
  const seen = new Set<string>()
  let current: DocumentSection | null = null
  let lineNumber = 0

  for (const rawLine of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    lineNumber += 1
    const line = rawLine.trim()
    if (!line) continue
    assertSafeLine(line, lineNumber)

    const heading = headingPattern.exec(line)
    if (heading) {
      const level = heading[1].length
      if (level !== 2)
        throw new DocumentDraftParseError(
          'Only "##" section headings are allowed; the renderer owns the document title.',
          lineNumber,
        )
      const sectionId = sectionIdForHeading(kind, heading[2])
      if (!sectionId)
        throw new DocumentDraftParseError(
          `Unknown section heading "${heading[2].trim()}".`,
          lineNumber,
        )
      if (seen.has(sectionId))
        throw new DocumentDraftParseError(`Duplicate section "${heading[2].trim()}".`, lineNumber)
      seen.add(sectionId)
      if (sections.length >= MAX_SECTIONS)
        throw new DocumentDraftParseError('Too many sections in the document draft.', lineNumber)
      current = { id: sectionId, heading: heading[2].trim(), blocks: [] }
      sections.push(current)
      continue
    }

    if (!current)
      throw new DocumentDraftParseError('Content must appear inside a "##" section.', lineNumber)
    if (current.blocks.length >= MAX_BLOCKS_PER_SECTION)
      throw new DocumentDraftParseError(
        `Section "${current.heading}" exceeds ${MAX_BLOCKS_PER_SECTION} blocks.`,
        lineNumber,
      )

    if (bulletPattern.test(line)) {
      const text = line.replace(bulletPattern, '').trim()
      if (text.length > MAX_TEXT_LENGTH)
        throw new DocumentDraftParseError('Bullet text is too long.', lineNumber)
      current.blocks.push({ kind: 'bullet', text })
    } else {
      if (line.length > MAX_TEXT_LENGTH)
        throw new DocumentDraftParseError('Paragraph text is too long.', lineNumber)
      current.blocks.push({ kind: 'paragraph', text: line })
    }
  }

  if (!sections.length) throw new DocumentDraftParseError('The document draft has no sections.')
  return { kind, sections }
}

/** Extracts every block's plain text from a parsed draft. */
export function collectDraftText(draft: DocumentDraft): string {
  return draft.sections.flatMap((section) => section.blocks.map((block) => block.text)).join('\n')
}

export function countDraftBullets(draft: DocumentDraft): number {
  return draft.sections.reduce(
    (total, section) => total + section.blocks.filter((block) => block.kind === 'bullet').length,
    0,
  )
}

export function countDraftWords(draft: DocumentDraft): number {
  return (collectDraftText(draft).match(/[\p{L}\p{N}]+/gu) ?? []).length
}

const documentBlockSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('paragraph'), text: z.string() }).strict(),
  z.object({ kind: z.literal('bullet'), text: z.string() }).strict(),
])

const documentSectionSchema = z
  .object({ id: z.string(), heading: z.string(), blocks: z.array(documentBlockSchema) })
  .strict()

const documentDraftSchema = z
  .object({ kind: z.enum(documentKinds), sections: z.array(documentSectionSchema) })
  .strict()

/** Parses a previously frozen draft model (from a snapshot) back into shape. */
export function parseStoredDocumentDraft(json: unknown): DocumentDraft {
  return documentDraftSchema.parse(json) as unknown as DocumentDraft
}
