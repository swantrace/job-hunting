export type RequirementImportance = 'required' | 'preferred' | 'mentioned'
export type RequirementEvidenceStatus = 'direct' | 'transferable' | 'unknown-evidence'

export type CoverageRequirement = {
  evidenceStatus: RequirementEvidenceStatus
  importance: RequirementImportance
}

export type CoveragePart = {
  matchedWeight: number
  totalWeight: number
  percentage: number | null
}

const importanceWeight: Record<RequirementImportance, number> = {
  required: 3,
  preferred: 1,
  mentioned: 0,
}

function percentage(matchedWeight: number, totalWeight: number) {
  return totalWeight === 0 ? null : (matchedWeight / totalWeight) * 100
}

/**
 * Deterministic, explainable requirement coverage. Uses the same transparent
 * importance weights as skills (required 3, preferred 1, mentioned 0) and
 * reports two separately named metrics: `directCoverage` counts only direct
 * evidence while `supportedCoverage` counts direct and transferable evidence.
 * Mentioned requirements never change the denominator, and no weighted
 * requirements returns null rather than a fabricated 0%.
 */
export function calculateRequirementCoverage(requirements: CoverageRequirement[]): {
  directCoverage: CoveragePart
  supportedCoverage: CoveragePart
} {
  const totalWeight = requirements.reduce(
    (sum, requirement) => sum + importanceWeight[requirement.importance],
    0,
  )
  const directWeight = requirements
    .filter((requirement) => requirement.evidenceStatus === 'direct')
    .reduce((sum, requirement) => sum + importanceWeight[requirement.importance], 0)
  const supportedWeight = requirements
    .filter(
      (requirement) =>
        requirement.evidenceStatus === 'direct' || requirement.evidenceStatus === 'transferable',
    )
    .reduce((sum, requirement) => sum + importanceWeight[requirement.importance], 0)

  return {
    directCoverage: {
      matchedWeight: directWeight,
      totalWeight,
      percentage: percentage(directWeight, totalWeight),
    },
    supportedCoverage: {
      matchedWeight: supportedWeight,
      totalWeight,
      percentage: percentage(supportedWeight, totalWeight),
    },
  }
}
