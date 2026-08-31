import { type CandidateFit, candidateFitSchema } from '../ai/schemas/candidate-fit'
import { normalizeEvidenceStatus } from './evidence/status'

/**
 * Parses a stored candidate-fit result, normalizing the legacy `missing`
 * evidence status once at the typed-read boundary. New AI output writes only
 * `direct`, `transferable`, or `unknown-evidence`; historical rows may still
 * contain `missing`, which maps to `unknown-evidence` without rewriting history.
 */
export function parseStoredCandidateFit(resultJson: string | null): CandidateFit | null {
  if (!resultJson) return null
  try {
    const raw = JSON.parse(resultJson) as unknown
    if (
      !raw ||
      typeof raw !== 'object' ||
      !Array.isArray((raw as { requirementAssessments?: unknown }).requirementAssessments)
    )
      return null
    const record = raw as { requirementAssessments: Array<Record<string, unknown>> }
    const normalized = {
      ...record,
      requirementAssessments: record.requirementAssessments.map((assessment) => ({
        ...assessment,
        evidenceStatus: normalizeEvidenceStatus(assessment.evidenceStatus),
      })),
    }
    const parsed = candidateFitSchema.safeParse(normalized)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
