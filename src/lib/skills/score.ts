import type { SkillDecision, SkillImportance, SkillMatchResult } from './constants'

export type ScoreRequirement = {
  analysisResult: SkillMatchResult
  importance: SkillImportance
  userDecision: SkillDecision
}

export type ScorePart = {
  matchedWeight: number
  totalWeight: number
  percentage: number | null
}

export type SkillScores = {
  canonicalMatch: ScorePart
  applicationCoverage: ScorePart
}

const importanceWeight: Record<SkillImportance, number> = {
  required: 3,
  preferred: 1,
  mentioned: 0,
}

function percentage(matchedWeight: number, totalWeight: number) {
  return totalWeight === 0 ? null : (matchedWeight / totalWeight) * 100
}

/**
 * Calculates explainable dual scores. Required skills weigh 3, preferred 1,
 * and mentioned skills are displayed but excluded from the denominator.
 * Canonical match counts only proven matches; application coverage also counts
 * user-confirmed Include decisions. Skip and pending count as uncovered.
 */
export function calculateSkillScores(requirements: ScoreRequirement[]): SkillScores {
  const totalWeight = requirements.reduce(
    (sum, requirement) => sum + importanceWeight[requirement.importance],
    0,
  )
  const canonicalMatchedWeight = requirements
    .filter((requirement) => requirement.analysisResult === 'proven-match')
    .reduce((sum, requirement) => sum + importanceWeight[requirement.importance], 0)
  const coverageMatchedWeight = requirements
    .filter(
      (requirement) =>
        requirement.analysisResult === 'proven-match' || requirement.userDecision === 'include',
    )
    .reduce((sum, requirement) => sum + importanceWeight[requirement.importance], 0)

  return {
    canonicalMatch: {
      matchedWeight: canonicalMatchedWeight,
      totalWeight,
      percentage: percentage(canonicalMatchedWeight, totalWeight),
    },
    applicationCoverage: {
      matchedWeight: coverageMatchedWeight,
      totalWeight,
      percentage: percentage(coverageMatchedWeight, totalWeight),
    },
  }
}
