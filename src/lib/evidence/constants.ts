export const evidenceSourceTypes = [
  'experience',
  'achievement',
  'project',
  'publication',
  'skill',
  'story',
] as const
export type EvidenceSourceType = (typeof evidenceSourceTypes)[number]

export const evidenceRelevances = ['direct', 'transferable'] as const
export type EvidenceRelevance = (typeof evidenceRelevances)[number]

/**
 * Evidence statuses for a requirement assessment. `unknown-evidence` means the
 * supplied canonical career data cannot verify the requirement — it never means
 * the candidate lacks the skill. The historical `missing` status is normalized
 * to `unknown-evidence` at the read boundary (see `lib/evidence/status`).
 */
export const evidenceStatuses = ['direct', 'transferable', 'unknown-evidence'] as const
export type EvidenceStatus = (typeof evidenceStatuses)[number]
