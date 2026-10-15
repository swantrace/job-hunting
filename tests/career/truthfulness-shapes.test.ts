import { describe, expect, test } from 'bun:test'
import { readCareerCandidate, saveCareerCandidate } from '../../src/db/career-facts'
import {
  candidateFormSchema,
  candidateFormValues,
  candidateInput,
} from '../../src/lib/career/form-input'
import { truthfulnessSchema, truthfulnessView } from '../../src/lib/career/json-schemas'
import { createCareerTestDatabase } from '../support/career-db'

/**
 * Real career data expresses truthfulness rules either as an object of named
 * flags or as an ordered list of rule statements. Both shapes must survive the
 * repository, the form and the editor: the plan requires every original fact to
 * be preserved, and an untouched record must not be rewritten into the other
 * shape.
 */

function database() {
  return createCareerTestDatabase({ seed: false })
}

const ruleList = [
  'Never claim experience with a technology I have not used.',
  'Never inflate dates, titles, or scope.',
  'Always be able to explain every bullet in an interview.',
  'Do not present learning-level skills as professional expertise.',
  'State limitations plainly instead of hiding them.',
]

describe('truthfulness rule shapes', () => {
  test('round trip an ordered rule list verbatim', () => {
    const { sqlite, executor, cleanup } = database()
    try {
      expect(
        saveCareerCandidate(executor, {
          fullName: 'Fixture Candidate',
          email: null,
          truthfulness: ruleList,
        }),
      ).toEqual({ changed: true, revision: 1 })

      const stored = readCareerCandidate(executor)
      expect(stored?.truthfulness).toEqual(ruleList)

      // Re-saving the same list is a no-op, so an untouched record stays put.
      expect(
        saveCareerCandidate(executor, {
          fullName: 'Fixture Candidate',
          email: null,
          truthfulness: stored?.truthfulness,
        }),
      ).toEqual({ changed: false, revision: 1 })
    } finally {
      sqlite.close()
      cleanup()
    }
  })

  test('round trip the flag object without being rewritten into a list', () => {
    const { sqlite, executor, cleanup } = database()
    try {
      saveCareerCandidate(executor, {
        fullName: 'Fixture Candidate',
        email: null,
        truthfulness: {
          neverClaimUnexperiencedSkill: true,
          requireAccurateDates: false,
          notes: 'x',
        },
      })
      const stored = readCareerCandidate(executor)
      expect(stored?.truthfulness).toEqual({
        neverClaimUnexperiencedSkill: true,
        requireAccurateDates: false,
        notes: 'x',
      })
    } finally {
      sqlite.close()
      cleanup()
    }
  })

  test('reports the stored shape instead of guessing one', () => {
    expect(truthfulnessView(ruleList)).toEqual({ shape: 'rules', rules: ruleList, flags: null })
    expect(truthfulnessView({ requireAccurateDates: true })).toMatchObject({
      shape: 'flags',
      rules: [],
    })
    expect(truthfulnessView(null)).toMatchObject({ shape: 'flags', rules: [], flags: null })
  })

  test('rejects a rule list that is not a list of non-empty statements', () => {
    expect(truthfulnessSchema.safeParse(['   ']).success).toBe(false)
    expect(truthfulnessSchema.safeParse('plain string').success).toBe(false)
    expect(truthfulnessSchema.safeParse([...ruleList]).success).toBe(true)
  })
})

/** Mirrors the identity route: form values are validated before they are mapped. */
function submit(values: Record<string, string>) {
  return candidateInput(candidateFormSchema.parse(values))
}

describe('truthfulness editing keeps the authored shape', () => {
  test('a rule list becomes editable lines and is written back as a list', () => {
    const values = candidateFormValues(
      { fullName: 'Fixture Candidate', email: null, truthfulness: ruleList },
      null,
    )
    expect(values.truthfulnessShape).toBe('rules')
    expect(values.truthfulnessRules).toBe(ruleList.join('\n'))

    expect(submit(values).truthfulness).toEqual(ruleList)
  })

  test('a flag object keeps its checkboxes and is written back as an object', () => {
    const values = candidateFormValues(
      {
        fullName: 'Fixture Candidate',
        email: null,
        truthfulness: { neverClaimUnexperiencedSkill: true, requireAccurateDates: true },
      },
      null,
    )
    expect(values.truthfulnessShape).toBe('flags')
    expect(values.truthfulnessRules).toBe('')
    expect(values.neverClaimUnexperiencedSkill).toBe('on')

    expect(submit(values).truthfulness).toEqual({
      neverClaimUnexperiencedSkill: true,
      requireAccurateDates: true,
      notes: null,
    })
  })

  test('empty edits record no rule rather than an empty placeholder', () => {
    const base = candidateFormValues({ fullName: 'Fixture Candidate', email: null }, null)
    expect(
      submit({ ...base, truthfulnessShape: 'rules', truthfulnessRules: '  \n ' }).truthfulness,
    ).toBeNull()
    expect(submit({ ...base, truthfulnessShape: 'flags' }).truthfulness).toBeNull()
  })
})
