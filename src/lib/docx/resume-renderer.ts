import { AlignmentType, Document, Packer, Paragraph, TextRun } from 'docx'
import type { DocumentDraft } from '../document-draft'
import {
  contactLineParts,
  type DocumentIdentity,
  footerWithPageNumber,
  sectionBlockParagraphs,
  sectionHeadingParagraph,
} from './render-common'
import {
  documentBaseStyles,
  documentNumbering,
  docxColors,
  docxMargins,
  docxTypography,
} from './styles'

export type ResumeRenderContext = {
  identity: DocumentIdentity
  /** Renderer-owned target title; the model never overwrites it. */
  targetTitle: string
}

function contactParagraph(identity: DocumentIdentity): Paragraph {
  const parts = contactLineParts(identity)
  if (!parts.length)
    return new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun('')] })
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 40 },
    children: parts.flatMap((part, index) => [
      ...(index > 0
        ? [new TextRun({ text: '  ·  ', color: docxColors.muted, size: docxTypography.mutedSize })]
        : []),
      new TextRun({ text: part, color: docxColors.body, size: docxTypography.bodySize }),
    ]),
  })
}

/**
 * Renders a validated resume document model to DOCX. The renderer owns the name
 * heading, target title, contact line, section hierarchy, bullets, and footer;
 * no blank template or placeholder is involved.
 */
export async function renderResumeDocx(
  draft: DocumentDraft,
  context: ResumeRenderContext,
): Promise<Buffer> {
  const children: (Paragraph | import('docx').Table)[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [
        new TextRun({
          text: context.identity.fullName,
          bold: true,
          size: docxTypography.nameSize,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [
        new TextRun({
          text: context.targetTitle,
          color: docxColors.heading,
          size: docxTypography.titleSize,
        }),
      ],
    }),
    contactParagraph(context.identity),
  ]
  for (const section of draft.sections) {
    children.push(sectionHeadingParagraph(section))
    children.push(...sectionBlockParagraphs(section))
  }

  const doc = new Document({
    styles: documentBaseStyles(),
    numbering: documentNumbering(),
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
