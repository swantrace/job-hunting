import { loadCareerData } from '../career-data'
import type { SkillMatchResult } from './constants'
import { determineMatchResult } from './match-career-skills'

/**
 * Resolves operational skill keys against the current canonical career-data
 * file. The database key is identity; no label or alias guessing is allowed.
 */
export function careerSkillMatchResult(skillKey: string): SkillMatchResult {
  return determineMatchResult(skillKey, loadCareerData())
}

export function careerSkillKeys(): ReadonlySet<string> {
  return new Set(loadCareerData().skills.skills.map((skill) => skill.id))
}
