import { expect, test } from 'bun:test'
import { isMeaningfulSkillTerm } from '../../src/lib/skills/normalize'
import { resolveRequirementTerms } from '../../src/lib/skills/resolver'

test('punctuation-only terms never become skills, including when the model proposes a valid key', () => {
  for (const term of [')', '(', ' / ', '...', '&', '++', '#', '—', '  ']) {
    expect(isMeaningfulSkillTerm(term)).toBe(false)
    expect(
      resolveRequirementTerms({
        terms: [{ term, key: 'react' }],
        catalog: [{ key: 'react', name: 'React', category: null, aliases: [] }],
      }),
    ).toEqual([])
  }
})

test('composite splitting drops punctuation fragments without discarding the valid part', () => {
  const result = resolveRequirementTerms({
    terms: [{ term: 'React / )' }, { term: ') / TypeScript' }],
    catalog: [],
  })
  expect(result.map((row) => row.rawTerm)).toEqual(['React', 'TypeScript'])
})

test('valid technical punctuation, one-letter names, numbers, and Unicode names stay supported', () => {
  for (const term of ['C++', 'C#', '.NET', 'Node.js', 'R', 'F#', '3D', 'λ-calculus']) {
    expect(isMeaningfulSkillTerm(term)).toBe(true)
    expect(resolveRequirementTerms({ terms: [{ term }], catalog: [] })[0]?.rawTerm).toBe(term)
  }
})
