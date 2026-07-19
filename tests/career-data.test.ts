import { describe, expect, test } from 'bun:test'
import { loadCareerData, validateCareerData } from '../src/lib/career-data'

describe('canonical career data', () => {
  test('validates the checked-in fact files and profile references', () => {
    const data = loadCareerData()
    expect(data.profiles.map((profile) => profile.id).sort()).toEqual([
      'fhir',
      'frontend',
      'fullstack',
    ])
  })

  test('rejects a missing cross-file skill reference', () => {
    const data = loadCareerData()
    data.profiles[0].preferredSkillIds.push('missing-skill')
    expect(() => validateCareerData(data)).toThrow('unknown ID "missing-skill"')
  })
})
