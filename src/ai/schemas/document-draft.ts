import { draftSchemaVersion } from '../../lib/document-draft'

/**
 * The document drafting contract. The LLM returns Markdown (not structured JSON)
 * which is then parsed and validated by `src/lib/document-draft.ts` and
 * `src/lib/document-draft-validation.ts`. This module owns the version used in
 * generation freshness.
 */

export const documentDraftSchemaVersion = draftSchemaVersion

/** JSON schema for the structured wrapper around the two Markdown drafts. */
export const documentDraftResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    resume_markdown: { type: 'string' },
    cover_letter_markdown: { type: 'string' },
  },
  required: ['resume_markdown', 'cover_letter_markdown'],
} as const
