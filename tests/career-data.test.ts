import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { validateCareerData } from '../src/lib/career-data'
import { parseSkillTaxonomy } from '../src/lib/skills/taxonomy'
import { loadExampleCareerData } from './support/career-data'

/**
 * The checked-in example files are an import source, not runtime data. These
 * checks validate the import shape against the directory's own taxonomy; the
 * runtime category vocabulary comes from the `skill_categories` table.
 */
const exampleTaxonomyKeys = new Set(
  parseSkillTaxonomy(
    JSON.parse(
      readFileSync(resolve(process.cwd(), 'career-data.example/skill-taxonomy.json'), 'utf8'),
    ),
  ).categories.map((category) => category.key),
)

describe('canonical career data', () => {
  test('validates the checked-in fact files and direction definitions', () => {
    const data = loadExampleCareerData()
    expect(Object.keys(data.preferences.directionDefinitions).sort()).toEqual([
      'fhir',
      'frontend',
      'fullstack',
    ])
  })

  test('rejects a career skill alias that collides with another skill label', () => {
    const data = loadExampleCareerData()
    data.skills.skills[0].label = 'Distinctive Label'
    data.skills.skills[1].aliases = ['distinctive label']
    expect(() => validateCareerData(data, exampleTaxonomyKeys)).toThrow(/label/i)
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
      expect(exampleTaxonomyKeys.has(skill.category)).toBe(true)
    }
  })

  test('rejects a career skill alias that collides with another skill label', () => {
    const data = loadExampleCareerData()
    data.skills.skills[0].label = 'Distinctive Label'
    data.skills.skills[1].aliases = ['distinctive label']
    expect(() => validateCareerData(data, exampleTaxonomyKeys)).toThrow(/label/i)
  })
})
