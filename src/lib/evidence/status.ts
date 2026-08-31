import { type CandidateFit, candidateFitSchema } from '../../ai/schemas/candidate-fit'
import { type EvidenceStatus, evidenceStatuses } from './constants'

/**
 * Single domain source of truth for evidence-status presentation and for the
 * v1.0.0 -> v1.1.0 compatibility conversion. New model output uses only
 * `direct`, `transferable`, and `unknown-evidence`; persisted v1.0.0 rows that
 * still contain `missing` are normalized here, at the read boundary, and never
 * rewritten in bulk.
 */
export const evidenceStatusLabels: Record<EvidenceStatus, string> = {
  direct: 'Direct',
  transferable: 'Transferable',
  'unknown-evidence': 'Unverified in career data',
}

export const evidenceStatusBadges: Record<EvidenceStatus, string> = {
  direct: 'badge-success',
  transferable: 'badge-warning',
  'unknown-evidence': 'badge-neutral',
}

export function isEvidenceStatus(value: unknown): value is EvidenceStatus {
  return typeof value === 'string' && (evidenceStatuses as readonly string[]).includes(value)
}

/** Maps a persisted status to the v1.1.0 status, or null for unknown values. */
export function normalizeEvidenceStatus(value: unknown): EvidenceStatus | null {
  if (value === 'missing') return 'unknown-evidence'
  return isEvidenceStatus(value) ? value : null
}

/**
 * Compatibility reader for a persisted candidate-fit result. Parses v1.1.0 JSON
 * directly and transparently maps a historical v1.0.0 `missing` evidence status
 * to `unknown-evidence` before the strict schema check, so old rows stay
 * viewable and new rows never write `missing`.
 */
export function parseCandidateFitResult(json: string | null | undefined): CandidateFit | null {
  if (!json) return null
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  if (Array.isArray(record.requirementAssessments)) {
    record.requirementAssessments = record.requirementAssessments.map((assessment) => {
      if (typeof assessment !== 'object' || assessment === null || Array.isArray(assessment))
        return assessment
      const item = assessment as Record<string, unknown>
      const status = normalizeEvidenceStatus(item.evidenceStatus)
      return status === null ? item : { ...item, evidenceStatus: status }
    })
  }
  const parsed = candidateFitSchema.safeParse(record)
  return parsed.success ? parsed.data : null
}
