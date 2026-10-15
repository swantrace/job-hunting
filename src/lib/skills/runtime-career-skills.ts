import { db } from '../../db/client'
import type { DbExecutor } from '../../db/skill-queries'
import { loadCareerData } from '../career/canonical-data'
import type { SkillMatchResult } from './constants'
import { determineMatchResult } from './match-career-skills'

/**
 * Resolves operational skill keys against the database-owned personal skills
 * (`career_skills` joined to the catalog). Possession requires a personal skill
 * with usable evidence and `resumeEligible`; the database key is identity and no
 * label or alias guessing is allowed.
 */
export function careerSkillMatchResult(
  skillKey: string,
  executor: DbExecutor = db,
): SkillMatchResult {
  return determineMatchResult(skillKey, loadCareerData(executor))
}

export function careerSkillKeys(executor: DbExecutor = db): ReadonlySet<string> {
  return new Set(loadCareerData(executor).skills.skills.map((skill) => skill.id))
}
