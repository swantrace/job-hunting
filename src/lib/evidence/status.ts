/**
 * Canonical evidence statuses and the legacy `missing` normalizer.
 *
 * The three product statuses are `direct`, `transferable`, and
 * `unknown-evidence`. Historical candidate-fit rows may have stored `missing`;
 * that value is normalized exactly once at the typed-read boundary and new AI
 * output must never write `missing`. `unknown-evidence` means supplied Career
 * Data does not verify a requirement — it never proves the user lacks a skill.
 */

export const evidenceStatuses = ['direct', 'transferable', 'unknown-evidence'] as const
export type EvidenceStatus = (typeof evidenceStatuses)[number]

const statusValues = new Set<string>(evidenceStatuses)

export function isEvidenceStatus(value: unknown): value is EvidenceStatus {
  return typeof value === 'string' && statusValues.has(value)
}

/**
 * Normalizes a stored status to the canonical three-status vocabulary. The only
 * legacy value accepted is `missing`, which maps to `unknown-evidence`.
 */
export function normalizeEvidenceStatus(value: unknown): EvidenceStatus {
  if (value === 'missing') return 'unknown-evidence'
  if (isEvidenceStatus(value)) return value
  throw new Error(`Unknown evidence status "${String(value)}".`)
}

export function isUnknownEvidence(status: EvidenceStatus): boolean {
  return status === 'unknown-evidence'
}

/** Neutral, non-judgemental copy for each status. */
export function evidenceStatusCopy(status: EvidenceStatus): string {
  switch (status) {
    case 'direct':
      return 'Supported by direct career evidence.'
    case 'transferable':
      return 'Supported by transferable evidence.'
    case 'unknown-evidence':
      return 'Career data does not verify this requirement. Include it only with a reason, or skip it.'
  }
}

export const applicationDecisions = ['include', 'skip'] as const
export type ApplicationDecision = (typeof applicationDecisions)[number]

export type DecisionValidation = { valid: boolean; errors: string[] }

/**
 * Application decisions are only Include (with a required user reason) or Skip.
 * Skipping never records a reason, and no other decision is accepted.
 */
export function validateApplicationDecision(
  decision: unknown,
  reason: unknown,
): DecisionValidation {
  if (decision === 'include') {
    if (typeof reason !== 'string' || reason.trim() === '')
      return { valid: false, errors: ['A reason is required to Include.'] }
    return { valid: true, errors: [] }
  }
  if (decision === 'skip') return { valid: true, errors: [] }
  return { valid: false, errors: ['Choose Include (with a reason) or Skip.'] }
}
