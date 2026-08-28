import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { type CanonicalCareerData, validateCareerData } from '../../src/lib/career-data'
import { loadExampleCareerData } from '../support/career-data'

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

    expect(() => validateCareerData(data)).toThrow(/category|miscellaneous/i)
  })

  careerTaxonomyTest('rejects normalized aliases shared by two career skills', () => {
    const { data, skills } = dataWithTaxonomyFields()
    expect(skills.length).toBeGreaterThanOrEqual(2)
    skills[0].aliases = ['Node.JS']
    skills[1].aliases = [' node.js ']

    expect(() => validateCareerData(data)).toThrow(
      new RegExp(`${skills[0].id}.*${skills[1].id}|${skills[1].id}.*${skills[0].id}`, 'i'),
    )
  })

  careerTaxonomyTest('rejects an alias colliding with another stable skill id', () => {
    const { data, skills } = dataWithTaxonomyFields()
    expect(skills.length).toBeGreaterThanOrEqual(2)
    skills[0].aliases = [skills[1].id.toUpperCase()]

    expect(() => validateCareerData(data)).toThrow(/alias|collision|duplicate/i)
  })
})
