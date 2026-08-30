import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { todayISO } from '../lib/date'
import type {
  SkillDecision,
  SkillImportance,
  SkillMatchResult,
  SkillOrigin,
  SkillReviewStatus,
} from '../lib/skills/constants'
import { normalizeSkillAlias } from '../lib/skills/normalize'
import type { SkillCategory } from '../lib/skills/taxonomy'
import { db } from './client'
import {
  analysisRunDecisions,
  jobPostingAnalyses,
  jobPostings,
  jobRequirements,
  jobRequirementsToSkills,
  type Skill,
  skillAliases,
  skills,
} from './schema'

export type DbExecutor = Pick<typeof db, 'select' | 'insert' | 'delete' | 'update'>

export function resolveSkillByKey(tx: DbExecutor, key: string): Skill | undefined {
  return tx.select().from(skills).where(eq(skills.key, key)).get()
}

export function resolveSkillByAlias(tx: DbExecutor, normalizedAlias: string): Skill | undefined {
  const alias = tx
    .select()
    .from(skillAliases)
    .where(eq(skillAliases.normalizedAlias, normalizedAlias))
    .get()
  if (!alias) return undefined
  return tx.select().from(skills).where(eq(skills.id, alias.skillId)).get()
}

/**
 * Resolves a raw skill name to an existing canonical skill by normalized key
 * first and then by normalized alias. Returns undefined when no skill matches.
 */
export function resolveSkill(tx: DbExecutor, name: string): Skill | undefined {
  const normalized = normalizeSkillAlias(name)
  return resolveSkillByKey(tx, normalized) ?? resolveSkillByAlias(tx, normalized)
}

export function insertSkill(
  tx: DbExecutor,
  input: {
    name: string
    key?: string
    category?: SkillCategory | null
    reviewStatus?: SkillReviewStatus
    origin?: SkillOrigin
    careerSkillId?: string | null
  },
): Skill {
  const date = todayISO()
  const origin = input.origin ?? 'manual'
  const skill = tx
    .insert(skills)
    .values({
      key: input.key ?? normalizeSkillAlias(input.name),
      name: input.name,
      category: input.category ?? null,
      reviewStatus: input.reviewStatus ?? 'pending',
      origin,
      careerSkillId: input.careerSkillId ?? null,
      createdAt: date,
      updatedAt: date,
    })
    .returning()
    .get()
  tx.insert(skillAliases)
    .values({
      skillId: skill.id,
      alias: input.name,
      normalizedAlias: normalizeSkillAlias(input.name),
      origin,
      createdAt: date,
    })
    .run()
  return skill
}

export function getOrCreateSkill(
  tx: DbExecutor,
  name: string,
  origin: SkillOrigin = 'manual',
): Skill {
  const existing = resolveSkill(tx, name)
  return existing ?? insertSkill(tx, { name, origin })
}

export function resolveApprovedSkill(tx: DbExecutor, normalized: string): Skill | undefined {
  const byKey = tx
    .select()
    .from(skills)
    .where(and(eq(skills.key, normalized), eq(skills.reviewStatus, 'approved')))
    .get()
  if (byKey) return byKey
  const alias = tx
    .select()
    .from(skillAliases)
    .where(eq(skillAliases.normalizedAlias, normalized))
    .get()
  if (!alias) return undefined
  return tx
    .select()
    .from(skills)
    .where(and(eq(skills.id, alias.skillId), eq(skills.reviewStatus, 'approved')))
    .get()
}

export function addAliasIfAbsent(
  tx: DbExecutor,
  skillId: number,
  alias: string,
  origin: SkillOrigin,
) {
  const normalized = normalizeSkillAlias(alias)
  const existing = tx
    .select()
    .from(skillAliases)
    .where(eq(skillAliases.normalizedAlias, normalized))
    .get()
  if (existing) return
  tx.insert(skillAliases)
    .values({ skillId, alias, normalizedAlias: normalized, origin, createdAt: todayISO() })
    .run()
}

export type RequirementSkillMapping = {
  skillId: number
  skillName: string
  skillKey: string
  category: SkillCategory | null
  careerSkillId: string | null
  reviewStatus: SkillReviewStatus
  requirementId: number
  requirementSequence: number
  requirementStatement: string
  importance: SkillImportance
  rawLabel: string | null
  confidence: number | null
}

/**
 * Canonical requirement-owned skill projection for one Job Analysis run. This
 * joins `job_requirements` through `job_requirements_to_skills` to `skills`,
 * never `job_applications_to_skills`, so the same skill may appear once per
 * requirement without losing source or importance context.
 */
export function listRequirementSkillMappings(
  jobPostingAnalysisId: number,
  executor: DbExecutor = db,
): RequirementSkillMapping[] {
  return executor
    .select({
      skillId: skills.id,
      skillName: skills.name,
      skillKey: skills.key,
      category: skills.category,
      careerSkillId: skills.careerSkillId,
      reviewStatus: skills.reviewStatus,
      requirementId: jobRequirements.id,
      requirementSequence: jobRequirements.sequence,
      requirementStatement: jobRequirements.statement,
      importance: jobRequirements.importance,
      rawLabel: jobRequirementsToSkills.rawLabel,
      confidence: jobRequirementsToSkills.confidence,
    })
    .from(jobRequirements)
    .innerJoin(
      jobRequirementsToSkills,
      eq(jobRequirements.id, jobRequirementsToSkills.jobRequirementId),
    )
    .innerJoin(skills, eq(skills.id, jobRequirementsToSkills.skillId))
    .where(eq(jobRequirements.jobPostingAnalysisId, jobPostingAnalysisId))
    .orderBy(asc(jobRequirements.sequence), asc(skills.id))
    .all()
}

/**
 * Application skill summary derived from the latest completed Job Analysis
 * run's requirement-skill mappings. This replaces the legacy
 * `job_applications_to_skills` projection; the current run selection is
 * refined by explicit lineage in later steps.
 */
export function listApplicationSkills(
  jobApplicationId: number,
  executor: DbExecutor = db,
): RequirementSkillMapping[] {
  const analysis = executor
    .select({ id: jobPostingAnalyses.id })
    .from(jobPostingAnalyses)
    .innerJoin(jobPostings, eq(jobPostingAnalyses.jobPostingId, jobPostings.id))
    .where(
      and(
        eq(jobPostings.jobApplicationId, jobApplicationId),
        eq(jobPostingAnalyses.status, 'Completed'),
      ),
    )
    .orderBy(desc(jobPostingAnalyses.id))
    .limit(1)
    .get()
  if (!analysis) return []
  return listRequirementSkillMappings(analysis.id, executor)
}

export type RunSkillReview = RequirementSkillMapping & {
  analysisResult: SkillMatchResult
  decision: SkillDecision
  decisionReason: string | null
  aliases: string[]
}

/**
 * Run-scoped skill review projection for the Review workspace. Combines the
 * exact Job Analysis run's requirement-skill mappings with that run's pending
 * Skip/Include decisions. "Proven" is derived from the canonical skill's
 * career-skill link; decisions belong only to the referenced run.
 */
export function listRunSkillReviews(runId: number, executor: DbExecutor = db): RunSkillReview[] {
  const run = executor
    .select({ jobPostingAnalysisId: jobPostingAnalyses.id })
    .from(jobPostingAnalyses)
    .where(eq(jobPostingAnalyses.id, runId))
    .get()
  if (!run) return []
  const mappings = listRequirementSkillMappings(run.jobPostingAnalysisId, executor)
  if (!mappings.length) return []
  const skillIds = [...new Set(mappings.map((mapping) => mapping.skillId))]
  const aliasRows = executor
    .select()
    .from(skillAliases)
    .where(inArray(skillAliases.skillId, skillIds))
    .all()
  const aliasesBySkill = new Map<number, string[]>()
  for (const alias of aliasRows) {
    const list = aliasesBySkill.get(alias.skillId) ?? []
    list.push(alias.alias)
    aliasesBySkill.set(alias.skillId, list)
  }
  const decisions = executor
    .select()
    .from(analysisRunDecisions)
    .where(eq(analysisRunDecisions.applicationAnalysisRunId, runId))
    .all()
  const decisionBySkill = new Map(decisions.map((decision) => [decision.skillId, decision]))
  return mappings.map((mapping) => {
    const decision = decisionBySkill.get(mapping.skillId)
    return {
      ...mapping,
      analysisResult: mapping.careerSkillId ? 'proven-match' : 'not-in-career-data',
      decision: decision?.decision ?? 'pending',
      decisionReason: decision?.reason ?? null,
      aliases: aliasesBySkill.get(mapping.skillId) ?? [],
    }
  })
}
