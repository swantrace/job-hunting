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
