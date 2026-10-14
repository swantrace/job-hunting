import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { type CanonicalCareerData, validateCareerData } from '../../src/lib/career-data'
import { parseSkillTaxonomy } from '../../src/lib/skills/taxonomy'
import { loadExampleCareerData } from '../support/career-data'

const exampleTaxonomyKeys = new Set(
  parseSkillTaxonomy(
    JSON.parse(
      readFileSync(resolve(process.cwd(), 'career-data.example/skill-taxonomy.json'), 'utf8'),
    ),
  ).categories.map((category) => category.key),
)

const constantsModule = resolve(process.cwd(), 'src/lib/skills/constants.ts')
const careerTaxonomyTest = existsSync(constantsModule) ? test : test.todo

type MutableSkill = Record<string, unknown> & {
  aliases?: string[]
  category?: string
  id: string
  label: string
}

function dataWithTaxonomyFields() {
  const data = structuredClone(loadExampleCareerData()) as CanonicalCareerData
  const skills = data.skills.skills as MutableSkill[]
  for (const skill of skills) {
    skill.category = 'frontend'
    skill.aliases = []
  }
  return { data, skills }
}

describe('planned career-data skill taxonomy validation', () => {
  careerTaxonomyTest('requires a controlled category for every career skill', () => {
    const { data, skills } = dataWithTaxonomyFields()
    expect(skills.length).toBeGreaterThan(0)
    skills[0].category = 'miscellaneous'

    expect(() => validateCareerData(data, exampleTaxonomyKeys)).toThrow(/category|miscellaneous/i)
  })

  careerTaxonomyTest('rejects normalized aliases shared by two career skills', () => {
    const { data, skills } = dataWithTaxonomyFields()
    expect(skills.length).toBeGreaterThanOrEqual(2)
    skills[0].aliases = ['Node.JS']
    skills[1].aliases = [' node.js ']

    expect(() => validateCareerData(data, exampleTaxonomyKeys)).toThrow(
      new RegExp(`${skills[0].id}.*${skills[1].id}|${skills[1].id}.*${skills[0].id}`, 'i'),
    )
  })

  careerTaxonomyTest('rejects an alias colliding with another stable skill id', () => {
    const { data, skills } = dataWithTaxonomyFields()
    expect(skills.length).toBeGreaterThanOrEqual(2)
    skills[0].aliases = [skills[1].id.toUpperCase()]

    expect(() => validateCareerData(data, exampleTaxonomyKeys)).toThrow(
      /alias|collision|duplicate/i,
    )
  })
})
