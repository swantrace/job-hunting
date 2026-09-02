import type { CandidateFit, EvidenceRef } from '../ai/schemas/candidate-fit'
import type { EvidenceSourceType } from './evidence/constants'

/**
 * The allowlist of canonical source IDs that may legally appear in an
 * evidence reference. The caller builds this from the frozen input, including
 * only safeToUse achievements, non-private projects, and generation-eligible
 * skills, so any ID outside the set is rejected even when Zod accepts its
 * shape.
 */
export type EvidenceAllowlist = Record<EvidenceSourceType, Set<string>>

export type CandidateFitValidationInput = {
  evidence: EvidenceAllowlist
}

export class CandidateFitValidationError extends Error {}

export function evidenceRefKey(ref: EvidenceRef) {
  return `${ref.sourceType}:${ref.sourceId}`
}

/**
 * Service-level validation for candidate-fit output. Rejects any evidence ID
 * that is not present in the frozen canonical input. Zod validates shape and
 * cross-field rules first; this boundary enforces that every reference resolves
 * to a real, eligible canonical source.
 */
export function validateCandidateFitEvidence(
  result: CandidateFit,
  input: CandidateFitValidationInput,
): CandidateFit {
  for (const assessment of result.requirementAssessments) {
    for (const ref of assessment.evidenceRefs) {
      const allowed = input.evidence[ref.sourceType]
      if (!allowed?.has(ref.sourceId))
        throw new CandidateFitValidationError(
          `Unknown or ineligible ${ref.sourceType} evidence ID "${ref.sourceId}".`,
        )
    }
  }
  return result
}

/**
 * Enforces that every persisted requirement received exactly one assessment.
 * Duplicate IDs are already rejected by the schema; this boundary catches a
 * missing assessment against the authoritative requirement list.
 */
export function assertEveryRequirementAssessed(requirementIds: number[], result: CandidateFit) {
  const assessed = new Set(
    result.requirementAssessments.map((assessment) => assessment.jobRequirementId),
  )
  const missing = requirementIds.filter((id) => !assessed.has(id))
  if (missing.length)
    throw new CandidateFitValidationError(
      `Missing assessment for requirement${missing.length === 1 ? '' : 's'} ${missing.join(', ')}.`,
    )
  return result
}
