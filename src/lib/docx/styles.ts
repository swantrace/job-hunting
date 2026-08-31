import { AlignmentType, LevelFormat } from 'docx'

/**
 * Versioned DOCX style system. The renderer owns margins, typography, heading
 * hierarchy, colors, and bullet geometry; no blank `.docx` template is used.
 * Bumping `docxRendererVersion` makes prior rendered documents stale.
 */

export const docxRendererVersion = '1.0.0'

export const docxTypography = {
  font: 'Calibri',
  bodySize: 22, // 11pt in half-points
  headingSize: 24, // 12pt
  titleSize: 30, // 15pt
  nameSize: 40, // 20pt
  mutedSize: 18, // 9pt
} as const

export const docxColors = {
  body: '1F1F1F',
  heading: '17375E',
  muted: '595959',
} as const

/** 0.5 inch margins, in twentieths of a point (DXA). */
export const docxMargins = { top: 720, right: 720, bottom: 720, left: 720 } as const

export const docxBulletReference = 'document-bullets'

export const docxBulletConfig = {
  reference: docxBulletReference,
  levels: [
    {
      level: 0,
      format: LevelFormat.BULLET,
      text: '\u2022',
      alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 360, hanging: 180 } } },
    },
  ],
} as const

export function documentBaseStyles() {
  return {
    default: {
      document: {
        run: {
          font: docxTypography.font,
          size: docxTypography.bodySize,
          color: docxColors.body,
        },
      },
    },
  }
}

export function documentNumbering() {
  return { config: [docxBulletConfig] }
}
