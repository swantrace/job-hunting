export const requirementTypes = [
  'skill',
  'experience',
  'responsibility',
  'education',
  'soft-skill',
  'domain',
] as const
export type RequirementType = (typeof requirementTypes)[number]

export const requirementImportances = ['required', 'preferred', 'mentioned'] as const
export type RequirementImportance = (typeof requirementImportances)[number]

export const analysisRequirementBases = ['explicit', 'inferred'] as const
export type AnalysisRequirementBasis = (typeof analysisRequirementBases)[number]

export const persistedRequirementBases = [...analysisRequirementBases, 'legacy'] as const
export type PersistedRequirementBasis = (typeof persistedRequirementBases)[number]
