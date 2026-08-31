import { describe, expect, test } from 'bun:test'
import {
  baselineDraftSystemPrompt,
  documentDraftPromptVersion,
  resumeDraftSystemPrompt,
} from '../../src/ai/prompts/document-draft'
import {
  documentDraftResponseSchema,
  documentDraftSchemaVersion,
} from '../../src/ai/schemas/document-draft'
import { draftSchemaVersion } from '../../src/lib/document-draft'

describe('base-grounded document draft contract', () => {
  test('prompt and parser contracts share one schema version', () => {
    expect(documentDraftSchemaVersion).toBe(draftSchemaVersion)
    expect(documentDraftPromptVersion).toMatch(/^\d+\.\d+\.\d+$/)
  })

  test('response schema returns the two Markdown drafts', () => {
    expect(documentDraftResponseSchema.required).toEqual([
      'resume_markdown',
      'cover_letter_markdown',
    ])
    expect(documentDraftResponseSchema.additionalProperties).toBe(false)
  })

  test('baseline prompt forbids inventing an employer or job description', () => {
    expect(baselineDraftSystemPrompt).toContain('no employer')
    expect(baselineDraftSystemPrompt).toContain('Do not invent')
  })

  test('resume prompt restricts the section vocabulary the parser enforces', () => {
    expect(resumeDraftSystemPrompt).toContain('## Summary')
    expect(resumeDraftSystemPrompt).toContain('## Education')
    expect(resumeDraftSystemPrompt).toContain('never use any other heading')
  })
})
