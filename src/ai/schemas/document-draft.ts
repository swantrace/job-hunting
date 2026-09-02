import { z } from 'zod'
import { draftSchemaVersion } from '../../lib/document-draft'

/**
 * The document drafting contract. Each request returns one Markdown document
 * inside a minimal Structured Outputs wrapper. The Markdown is then parsed and
 * validated by `src/lib/document-draft.ts` and
 * `src/lib/document-draft-validation.ts`.
 */

export const documentDraftSchemaVersion = draftSchemaVersion

/** Each resume and cover letter is generated independently in this wrapper. */
export const documentMarkdownSchema = z.object({ markdown: z.string().trim().min(1) }).strict()

export const documentMarkdownResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    markdown: { type: 'string' },
  },
  required: ['markdown'],
} as const
