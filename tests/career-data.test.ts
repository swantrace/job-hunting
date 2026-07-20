import { describe, expect, test } from 'bun:test'
import { loadCareerData, loadInterviewBank, validateCareerData } from '../src/lib/career-data'

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

  test('validates question taxonomy and canonical evidence references', () => {
    const data = loadCareerData()
    const bank = loadInterviewBank(data)
    expect(bank.questionFiles.flatMap((file) => file.questions)).not.toHaveLength(0)
    expect(bank.answers).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'midato-vite-001-v1' })]),
    )
    expect(
      bank.questionFiles.find((file) => file.fileName === 'questions/project-deep-dives.json')
        ?.questions,
    ).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'midato-vite-001' })]))
  })
})
