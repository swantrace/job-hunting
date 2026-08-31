import {
  AlignmentType,
  ExternalHyperlink,
  Footer,
  HeadingLevel,
  PageNumber,
  Paragraph,
  TextRun,
} from 'docx'
import type { DocumentSection } from '../document-draft'
import { docxBulletReference, docxColors, docxTypography } from './styles'

export type DocumentIdentity = {
  fullName: string
  email?: string | null
  phone?: string | null
  location?: string | null
  linkedin?: string | null
  github?: string | null
  portfolio?: string | null
}

const markdownLinkPattern = /\[([^\]]*)\]\(\s*(https?:\/\/[^)\s]+)\s*\)/g

/**
 * Converts inline Markdown `[text](url)` into ExternalHyperlink runs and all
 * remaining text into TextRuns. The parser already rejects unsafe links and raw
 * HTML, so every URL here is safe `http(s)`.
 */
export function inlineRuns(text: string) {
  const runs: (TextRun | ExternalHyperlink)[] = []
  let lastIndex = 0
  for (const match of text.matchAll(markdownLinkPattern)) {
    if (match.index > lastIndex) runs.push(new TextRun(text.slice(lastIndex, match.index)))
    runs.push(
      new ExternalHyperlink({
        children: [new TextRun({ text: match[1], style: 'Hyperlink' })],
        link: match[2],
      }),
    )
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) runs.push(new TextRun(text.slice(lastIndex)))
  return runs
}

export function footerWithPageNumber(name: string): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: name, color: docxColors.muted, size: docxTypography.mutedSize }),
          new TextRun({
            text: '  ·  Page ',
            color: docxColors.muted,
            size: docxTypography.mutedSize,
          }),
          new TextRun({
            children: [PageNumber.CURRENT],
            color: docxColors.muted,
            size: docxTypography.mutedSize,
          }),
        ],
      }),
    ],
  })
}

export function sectionHeadingParagraph(section: DocumentSection): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 200, after: 100 },
    children: [
      new TextRun({
        text: section.heading,
        bold: true,
        color: docxColors.heading,
        size: docxTypography.headingSize,
      }),
    ],
  })
}

export function sectionBlockParagraphs(section: DocumentSection): Paragraph[] {
  return section.blocks.map((block) =>
    block.kind === 'bullet'
      ? new Paragraph({
          numbering: { reference: docxBulletReference, level: 0 },
          spacing: { after: 40 },
          children: inlineRuns(block.text),
        })
      : new Paragraph({ spacing: { after: 80 }, children: inlineRuns(block.text) }),
  )
}

export function contactLineParts(identity: DocumentIdentity): string[] {
  const parts: string[] = []
  if (identity.email) parts.push(identity.email)
  if (identity.phone) parts.push(identity.phone)
  if (identity.location) parts.push(identity.location)
  if (identity.linkedin) parts.push(identity.linkedin)
  if (identity.github) parts.push(identity.github)
  if (identity.portfolio) parts.push(identity.portfolio)
  return parts
}
