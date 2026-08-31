import { AlignmentType, Document, Packer, Paragraph, TextRun } from 'docx'
import type { DocumentDraft } from '../document-draft'
import {
  type DocumentIdentity,
  footerWithPageNumber,
  sectionBlockParagraphs,
} from './render-common'
import { documentBaseStyles, docxColors, docxMargins, docxTypography } from './styles'

export type CoverLetterRenderContext = {
  identity: DocumentIdentity
  /** Renderer-owned company line; the model never overwrites it. */
  company: string | null
  /** Renderer-owned letter date. */
  date: string
  targetTitle: string | null
}

function sectionFirstText(draft: DocumentDraft, sectionId: string): string {
  const section = draft.sections.find((item) => item.id === sectionId)
  return section
    ? section.blocks
        .map((block) => block.text)
        .join(' ')
        .trim()
    : ''
}

function hasContent(section: { blocks: unknown[] }): boolean {
  return section.blocks.some((block) => {
    const text = (block as { text?: string }).text
    return typeof text === 'string' && text.trim() !== ''
  })
}

/**
 * Renders a validated cover-letter document model to DOCX. The salutation is
 * emitted exactly once as "Dear {recipient}," and the renderer owns the date,
 * company line, and signature; no duplicated "Re:"/"Dear" output is possible.
 */
export async function renderCoverLetterDocx(
  draft: DocumentDraft,
  context: CoverLetterRenderContext,
): Promise<Buffer> {
  const salutation = sectionFirstText(draft, 'salutation') || 'Hiring Team'
  const children: Paragraph[] = []

  if (context.date)
    children.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { after: 160 },
        children: [new TextRun({ text: context.date, color: docxColors.muted })],
      }),
    )

  children.push(
    new Paragraph({
      spacing: { after: 120 },
      children: [new TextRun({ text: `Dear ${salutation},` })],
    }),
  )

  for (const section of draft.sections) {
    if (section.id === 'salutation') continue
    if (!hasContent(section)) continue
    children.push(...sectionBlockParagraphs(section))
  }

  children.push(
    new Paragraph({
      spacing: { before: 240 },
      children: [new TextRun({ text: 'Sincerely,' })],
    }),
    new Paragraph({
      spacing: { before: 40 },
      children: [new TextRun({ text: context.identity.fullName, bold: true })],
    }),
  )

  const doc = new Document({
    styles: documentBaseStyles(),
    sections: [
      {
        properties: { page: { margin: docxMargins } },
        footers: { default: footerWithPageNumber(context.identity.fullName) },
        children,
      },
    ],
  })
  return Packer.toBuffer(doc)
}
