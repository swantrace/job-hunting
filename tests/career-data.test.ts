import { describe, expect, test } from 'bun:test'
import { validateCareerData } from '../src/lib/career-data'
import { hasSkillCategory } from '../src/lib/skills/taxonomy'
import { loadExampleCareerData } from './support/career-data'

describe('canonical career data', () => {
  test('validates the checked-in fact files and profile references', () => {
    const data = loadExampleCareerData()
    expect(data.profiles.map((profile) => profile.id).sort()).toEqual([
      'fhir',
      'frontend',
      'fullstack',
    ])
  })

  test('rejects a missing cross-file skill reference', () => {
    const data = loadExampleCareerData()
    data.profiles[0].preferredSkillIds.push('missing-skill')
    expect(() => validateCareerData(data)).toThrow('unknown ID "missing-skill"')
  })

  test('rejects a profile publication reference that does not exist', () => {
    const data = loadExampleCareerData()
    data.profiles[0].preferredPublicationIds.push('missing-publication')
    expect(() => validateCareerData(data)).toThrow('unknown ID "missing-publication"')
  })

  test('keeps the current career skill shape: stable id, label, and directions', () => {
    const data = loadExampleCareerData()
    expect(data.skills.skills.length).toBeGreaterThan(0)
    for (const skill of data.skills.skills) {
      expect(typeof skill.id).toBe('string')
      expect(skill.id.length).toBeGreaterThan(0)
      expect(typeof skill.label).toBe('string')
      expect(skill.label.length).toBeGreaterThan(0)
      expect(Array.isArray(skill.directions)).toBe(true)
    }
  })

  test('loads every career skill with a controlled canonical category', () => {
    const data = loadExampleCareerData()
    for (const skill of data.skills.skills) {
      expect(hasSkillCategory(skill.category)).toBe(true)
    }
  })

  test('rejects a career skill alias that collides with another skill label', () => {
    const data = loadExampleCareerData()
    data.skills.skills[0].label = 'Distinctive Label'
    data.skills.skills[1].aliases = ['distinctive label']
    expect(() => validateCareerData(data)).toThrow(/label/i)
  })
})
