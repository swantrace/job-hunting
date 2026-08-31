import { describe, expect, test } from 'bun:test'
import { parseDocumentDraft } from '../src/lib/document-draft'
import {
  validateDateBounds,
  validateDocumentDraft,
  validateEducationCoverage,
  validateExactTargetTitle,
  validatePageBudget,
  validateRepeatedTitleOrSalutation,
} from '../src/lib/document-draft-validation'

describe('deterministic document draft validation', () => {
  test('flags a missing exact target title', () => {
    const draft = parseDocumentDraft('## Summary\n\nBackend engineer.\n', 'resume')
    expect(validateExactTargetTitle(draft, 'FHIR Software Engineer')).toEqual([
      expect.objectContaining({ code: 'missing-target-title' }),
    ])
    expect(validateExactTargetTitle(draft, 'Backend Engineer')).toEqual([])
  })

  test('flags omitted education entries', () => {
    const draft = parseDocumentDraft(
      '## Education\n\n- MSc Computer Science, Example University\n',
      'resume',
    )
    expect(
      validateEducationCoverage(draft, [{ school: 'Other University', degree: 'BSc' }]),
    ).toEqual([expect.objectContaining({ code: 'missing-education' })])
    expect(
      validateEducationCoverage(draft, [
        { school: 'Example University', degree: 'MSc Computer Science' },
      ]),
    ).toEqual([])
  })

  test('flags future years and invalid full dates', () => {
    const draft = parseDocumentDraft(
      '## Summary\n\nGraduated 2099 and started 2026-13-40.\n',
      'resume',
    )
    const warnings = validateDateBounds(draft, '2026-08-31')
    expect(warnings.some((warning) => warning.code === 'future-date')).toBe(true)
    expect(warnings.some((warning) => warning.code === 'invalid-date')).toBe(true)
  })

  test('flags a repeated salutation and title', () => {
    const letter = parseDocumentDraft(
      '## Salutation\n\nDear Hiring Team\n\n## Opening\n\nDear Hiring Team\n',
      'cover-letter',
    )
    expect(validateRepeatedTitleOrSalutation(letter, { salutation: 'Dear Hiring Team' })).toEqual([
      expect.objectContaining({ code: 'repeated-salutation' }),
    ])
    const resume = parseDocumentDraft('## Summary\n\nEngineer Engineer Engineer\n', 'resume')
    expect(validateRepeatedTitleOrSalutation(resume, { title: 'Engineer' })).toEqual([
      expect.objectContaining({ code: 'repeated-title' }),
    ])
  })

  test('flags page-budget overruns without truncating', () => {
    const draft = parseDocumentDraft('## Summary\n\n' + 'word '.repeat(20) + '\n', 'resume')
    expect(validatePageBudget(draft, { maxWords: 5 })).toEqual([
      expect.objectContaining({ code: 'over-word-budget' }),
    ])
    expect(validatePageBudget(draft, { maxWords: 1000, maxBullets: 100 })).toEqual([])
  })

  test('aggregates all checks deterministically', () => {
    const draft = parseDocumentDraft('## Summary\n\nBackend engineer.\n', 'resume')
    const warnings = validateDocumentDraft(draft, {
      targetTitle: 'FHIR Software Engineer',
      education: [{ school: 'Example University' }],
    })
    const codes = warnings.map((warning) => warning.code)
    expect(codes).toContain('missing-target-title')
    expect(codes).toContain('missing-education')
  })
})
