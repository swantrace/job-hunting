import { describe, expect, test } from 'bun:test'
import { parseDocumentDraft } from '../src/lib/document-draft'
import {
  validateDateBounds,
  validateDocumentDraft,
  validateEducationCoverage,
  validatePageBudget,
  validateRepeatedTitleOrSalutation,
  validateSectionBlockCount,
  validateSectionContract,
  validateSectionWordBudget,
} from '../src/lib/document-draft-validation'

describe('deterministic document draft validation', () => {
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

  test('validates required, non-empty, ordered sections while allowing optional sections', () => {
    const valid = parseDocumentDraft(
      '## Summary\n\nSummary.\n## Skills\n\nSkills.\n## Experience\n\nExperience.\n## Education\n\nEducation.\n',
      'resume',
    )
    const contract = {
      required: ['summary', 'skills', 'experience', 'education'] as const,
      order: ['summary', 'skills', 'experience', 'projects', 'publications', 'education'] as const,
    }
    expect(
      validateSectionContract(valid, {
        required: [...contract.required],
        order: [...contract.order],
      }),
    ).toEqual([])

    const invalid = parseDocumentDraft(
      '## Experience\n\nExperience.\n## Summary\n\nSummary.\n',
      'resume',
    )
    const codes = validateSectionContract(invalid, {
      required: [...contract.required],
      order: [...contract.order],
    }).map((warning) => warning.code)
    expect(codes).toContain('missing-section')
    expect(codes).toContain('section-order')

    const emptyOptional = parseDocumentDraft(
      '## Summary\n\nSummary.\n## Skills\n\nSkills.\n## Experience\n\nExperience.\n## Projects\n## Education\n\nEducation.\n',
      'resume',
    )
    expect(
      validateSectionContract(emptyOptional, {
        required: [...contract.required],
        order: [...contract.order],
      }),
    ).toContainEqual(expect.objectContaining({ code: 'empty-section' }))
  })

  test('validates section-specific word and block budgets', () => {
    const resume = parseDocumentDraft('## Summary\n\n' + 'word '.repeat(10), 'resume')
    expect(validateSectionWordBudget(resume, 'summary', 5)).toEqual([
      expect.objectContaining({ code: 'over-section-word-budget' }),
    ])
    const letter = parseDocumentDraft(
      '## Evidence\n\nFirst example.\n\nSecond example.\n',
      'cover-letter',
    )
    expect(validateSectionBlockCount(letter, 'evidence', { min: 2, max: 3 })).toEqual([])
    expect(validateSectionBlockCount(letter, 'evidence', { min: 3 })).toEqual([
      expect.objectContaining({ code: 'too-few-section-blocks' }),
    ])
  })

  test('aggregates all checks deterministically', () => {
    const draft = parseDocumentDraft('## Summary\n\nBackend engineer.\n', 'resume')
    const warnings = validateDocumentDraft(draft, {
      education: [{ school: 'Example University' }],
      sectionContract: {
        required: ['summary', 'skills', 'experience', 'education'],
        order: ['summary', 'skills', 'experience', 'projects', 'publications', 'education'],
      },
    })
    const codes = warnings.map((warning) => warning.code)
    expect(codes).toContain('missing-section')
    expect(codes).toContain('missing-education')
  })
})
