import { describe, expect, test } from 'bun:test'
import {
  baselineDraftSystemPrompt,
  coverLetterDraftSystemPrompt,
  documentDraftPromptVersion,
  resumeDraftSystemPrompt,
} from '../../src/ai/prompts/document-draft'
import {
  documentDraftSchemaVersion,
  documentMarkdownResponseSchema,
} from '../../src/ai/schemas/document-draft'
import { draftSchemaVersion } from '../../src/lib/document-draft'

describe('base-grounded document draft contract', () => {
  test('prompt and parser contracts share one schema version', () => {
    expect(documentDraftSchemaVersion).toBe(draftSchemaVersion)
    expect(documentDraftPromptVersion).toMatch(/^\d+\.\d+\.\d+$/)
  })

  test('each independent request returns one Markdown draft through Structured Outputs', () => {
    expect(documentMarkdownResponseSchema.required).toEqual(['markdown'])
    expect(documentMarkdownResponseSchema.additionalProperties).toBe(false)
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

  test('resume prompt preserves the winning base-grounded editorial method', () => {
    expect(resumeDraftSystemPrompt).toContain('strongest truthful resume')
    expect(resumeDraftSystemPrompt).toContain('Edit the approved Base Resume')
    expect(resumeDraftSystemPrompt).toContain('rather than reconstructing')
    expect(resumeDraftSystemPrompt).toContain('Canonical Career Data is the factual authority')
    expect(resumeDraftSystemPrompt).toContain('within 750 words')
  })

  test('renderer owns the title and irrelevant resume sections are optional', () => {
    expect(resumeDraftSystemPrompt).toContain('renderer already displays the exact target title')
    expect(resumeDraftSystemPrompt).toContain('Optional sections')
    expect(resumeDraftSystemPrompt).toContain('omit it rather than render an empty')
    expect(resumeDraftSystemPrompt).not.toContain('Summary" opens with the exact target title')
  })

  test('cover letter complements the resume and has an explicit editorial budget', () => {
    expect(coverLetterDraftSystemPrompt).toContain('complements the resume')
    expect(coverLetterDraftSystemPrompt).toContain('2-3 coherent proof themes')
    expect(coverLetterDraftSystemPrompt).toContain('within 400 words')
    expect(coverLetterDraftSystemPrompt).toContain('avoids generic enthusiasm')
  })

  test('application-only skills cannot be upgraded into employment evidence', () => {
    expect(resumeDraftSystemPrompt).toContain('application-only included skill')
    expect(resumeDraftSystemPrompt).toContain('never present it as production employment')
  })
})
