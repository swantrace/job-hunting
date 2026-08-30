export type GenerationRequirement = {
  analysisResult: string
  decision: string
}

/**
 * A requirement is eligible for document generation only when it is a proven
 * match or a user-confirmed application-only Include. Skipped and pending
 * requirements are gaps and never enter resume or cover-letter inputs.
 */
export function isGenerationEligible(requirement: GenerationRequirement): boolean {
  return (
    requirement.analysisResult === 'proven-match' ||
    (requirement.analysisResult === 'not-in-career-data' && requirement.decision === 'include')
  )
}

export function generationEligibleRequirements<T extends GenerationRequirement>(
  requirements: T[],
): T[] {
  return requirements.filter(isGenerationEligible)
}
