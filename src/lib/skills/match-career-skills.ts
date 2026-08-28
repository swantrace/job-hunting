import type { CanonicalCareerData } from '../career-data'
import type { SkillMatchResult } from './constants'

/**
 * Career-truthfulness rule for usable supporting evidence. A career skill
 * counts as usable only when it carries at least one evidence reference and is
 * not explicitly marked as not resume-eligible.
 */
export function hasUsableEvidence(skill: Record<string, unknown>): boolean {
  if (skill.resumeEligible === false) return false
  const evidence = skill.evidence
  return Array.isArray(evidence) && evidence.length > 0
}

/**
 * Determines the two-state match result from canonical career skill identity,
 * never from broad category equality. A proven match requires a resolved
 * career skill with usable supporting evidence; everything else is
 * `not-in-career-data`.
 */
export function determineMatchResult(
  careerSkillId: string | null | undefined,
  careerData: Pick<CanonicalCareerData, 'skills'>,
): SkillMatchResult {
  if (!careerSkillId) return 'not-in-career-data'
  const careerSkill = careerData.skills.skills.find((skill) => skill.id === careerSkillId)
  if (!careerSkill) return 'not-in-career-data'
  return hasUsableEvidence(careerSkill as Record<string, unknown>)
    ? 'proven-match'
    : 'not-in-career-data'
}
