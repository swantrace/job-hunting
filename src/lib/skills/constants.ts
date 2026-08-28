/**
 * Canonical skill taxonomy vocabulary. Every consumer of skill categories,
 * review states, origins, match results, user decisions, and importance levels
 * must import these values from this module rather than redefining them.
 */

export const skillCategories = [
  'languages-web',
  'frontend',
  'backend-apis',
  'databases-caching',
  'messaging-async',
  'cloud-devops',
  'testing-quality',
  'security-identity',
  'ai-ml',
  'architecture-practices',
  'domain-platforms',
] as const
export type SkillCategory = (typeof skillCategories)[number]

export const skillCategoryLabels: Record<SkillCategory, string> = {
  'languages-web': 'Languages & Web Fundamentals',
  frontend: 'Frontend',
  'backend-apis': 'Backend & APIs',
  'databases-caching': 'Databases & Caching',
  'messaging-async': 'Messaging & Async Processing',
  'cloud-devops': 'Cloud & DevOps',
  'testing-quality': 'Testing & Quality',
  'security-identity': 'Security & Identity',
  'ai-ml': 'AI & ML',
  'architecture-practices': 'Architecture & Engineering Practices',
  'domain-platforms': 'Domain & Platforms',
}

export const skillReviewStatuses = ['pending', 'approved', 'rejected', 'merged'] as const
export type SkillReviewStatus = (typeof skillReviewStatuses)[number]

export const skillOrigins = ['career-data', 'job-parser', 'manual', 'import'] as const
export type SkillOrigin = (typeof skillOrigins)[number]

export const skillMatchResults = ['proven-match', 'not-in-career-data'] as const
export type SkillMatchResult = (typeof skillMatchResults)[number]

export const skillDecisions = ['pending', 'skip', 'include'] as const
export type SkillDecision = (typeof skillDecisions)[number]

export const skillImportances = ['required', 'preferred', 'mentioned'] as const
export type SkillImportance = (typeof skillImportances)[number]
