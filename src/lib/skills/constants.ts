/**
 * Fixed workflow states. Skill category definitions intentionally live in
 * config/skill-taxonomy.json rather than this source file so the application
 * can support a domain-specific taxonomy without a code change.
 */

import { type RequirementImportance, requirementImportances } from '../job-requirements/constants'

export const skillReviewStatuses = ['pending', 'approved', 'rejected', 'merged'] as const
export type SkillReviewStatus = (typeof skillReviewStatuses)[number]

export const skillOrigins = ['career-data', 'job-parser', 'manual', 'import'] as const
export type SkillOrigin = (typeof skillOrigins)[number]

export const skillMatchResults = ['proven-match', 'not-in-career-data'] as const
export type SkillMatchResult = (typeof skillMatchResults)[number]

export const skillDecisions = ['pending', 'skip', 'include'] as const
export type SkillDecision = (typeof skillDecisions)[number]

export const skillImportances = requirementImportances
export type SkillImportance = RequirementImportance
