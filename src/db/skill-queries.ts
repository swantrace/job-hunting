import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { nowISO } from '../lib/date'
import type {
  SkillDecision,
  SkillImportance,
  SkillMatchResult,
  SkillOrigin,
  SkillReviewStatus,
} from '../lib/skills/constants'
import {
  canonicalSkillKey,
  isMeaningfulSkillTerm,
  normalizeSkillAlias,
} from '../lib/skills/normalize'
import {
  readReviewSnapshot,
  reviewSkillEvidence,
  type SkillEvidenceKind,
  skillDecisionBasis,
} from '../lib/skills/review-evidence'
import type { SkillCategory } from '../lib/skills/taxonomy'
import { jobPostingAnalysisIdForCandidateRun } from './analysis-lineage'
import { db } from './client'
import {
  analysisRunDecisions,
  applicationAnalysisRuns,
  jobPostingAnalyses,
  jobPostings,
  jobRequirements,
  jobRequirementsToSkills,
  type Skill,
  skillAliases,
  skills,
} from './schema'

export type DbExecutor = Pick<typeof db, 'select' | 'insert' | 'delete' | 'update'>

/** Names, stable keys and aliases share one normalized namespace. */
export function assertSkillLabelAvailable(tx: DbExecutor, label: string, ownerIds: number[]) {
  if (!isMeaningfulSkillTerm(label) || label.trim().length > 120)
    throw new Error(
      'Skill names and aliases must contain a letter or number and be at most 120 characters.',
    )
  const normalized = normalizeSkillAlias(label)
  const collision = tx
    .select()
    .from(skills)
    .all()
    .find(
      (row) =>
        !ownerIds.includes(row.id) &&
        [row.name, row.key].some((value) => normalizeSkillAlias(value) === normalized),
    )
  const alias = tx
    .select()
    .from(skillAliases)
    .where(eq(skillAliases.normalizedAlias, normalized))
    .get()
  const aliasOwner =
    alias && !ownerIds.includes(alias.skillId)
      ? tx.select().from(skills).where(eq(skills.id, alias.skillId)).get()
      : undefined
  const owner = collision ?? aliasOwner
  if (owner)
    throw new Error(
      `"${label}" belongs to another skill: "${owner.name}" (key: ${owner.key}, ID: ${owner.id}). Merge the skills instead.`,
    )
}

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
 * Resolves a raw skill name to an existing canonical skill by canonical key
 * first (the immutable `skills.key` is kebab-case via `canonicalSkillKey` or a
 * career-data id), then by normalized key for legacy rows, then by normalized
 * alias. Returns undefined when no skill matches.
 */
export function resolveSkill(tx: DbExecutor, name: string): Skill | undefined {
  const normalized = normalizeSkillAlias(name)
  const byKey = resolveSkillByKey(tx, canonicalSkillKey(name)) ?? resolveSkillByKey(tx, normalized)
  return (
    byKey ??
    resolveSkillByAlias(tx, normalized) ??
    tx
      .select()
      .from(skills)
      .all()
      .find((row) => normalizeSkillAlias(row.name) === normalized)
  )
}

export function insertSkill(
  tx: DbExecutor,
  input: {
    name: string
    key?: string
    category?: SkillCategory | null
    reviewStatus?: SkillReviewStatus
    origin?: SkillOrigin
  },
): Skill {
  assertSkillLabelAvailable(tx, input.name, [])
  assertSkillLabelAvailable(tx, input.key ?? canonicalSkillKey(input.name), [])
  const date = nowISO()
  const origin = input.origin ?? 'manual'
  const skill = tx
    .insert(skills)
    .values({
      key: input.key ?? canonicalSkillKey(input.name),
      name: input.name,
      category: input.category ?? null,
      reviewStatus: input.reviewStatus ?? 'pending',
      origin,
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
    .where(and(eq(skills.key, canonicalSkillKey(normalized)), eq(skills.reviewStatus, 'approved')))
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
    .values({ skillId, alias, normalizedAlias: normalized, origin, createdAt: nowISO() })
    .run()
}

export type RequirementSkillMapping = {
  skillId: number
  skillName: string
  skillKey: string
  category: SkillCategory | null
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
 * never the removed application-skill relation table, so the same skill may appear once per
 * requirement without losing source or importance context.
 */
export function listRequirementSkillMappings(
  jobPostingAnalysisId: number,
  executor: Pick<DbExecutor, 'select'> = db,
): RequirementSkillMapping[] {
  return executor
    .select({
      skillId: skills.id,
      skillName: skills.name,
      skillKey: skills.key,
      category: skills.category,
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
 * removed application-skill projection; the current run selection is
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
  evidenceKind?: SkillEvidenceKind
  decisionBasisHash?: string | null
  previousDecisionId?: number | null
}

/**
 * Run-scoped skill review projection for the Review workspace. Combines the
 * exact Job Analysis run's requirement-skill mappings with that run's pending
 * Skip/Include decisions. Only a personal skill in the frozen career snapshot
 * with usable linked evidence determines "proven". Whole-requirement AI
 * assessments never downgrade personal possession of an individual skill.
 */
export function listRunSkillReviews(
  runId: number,
  executor: Pick<DbExecutor, 'select'> = db,
): RunSkillReview[] {
  const jobPostingAnalysisId = jobPostingAnalysisIdForCandidateRun(runId, executor)
  if (jobPostingAnalysisId === null) return []
  const mappings = listRequirementSkillMappings(jobPostingAnalysisId, executor)
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
  const run = executor
    .select()
    .from(applicationAnalysisRuns)
    .where(eq(applicationAnalysisRuns.id, runId))
    .get()
  const snapshot = readReviewSnapshot(run?.inputSnapshotJson ?? null)
  const grouped = new Map<number, RunSkillReview>()
  const rank = { required: 3, preferred: 2, mentioned: 1 }
  for (const mapping of mappings) {
    const decision = decisionBySkill.get(mapping.skillId)
    const evidenceKind = reviewSkillEvidence(mapping.skillKey, snapshot)
    const proven = evidenceKind === 'direct'
    const current: RunSkillReview = {
      ...mapping,
      analysisResult: proven ? 'proven-match' : 'not-in-career-data',
      decision: decision?.decision ?? 'pending',
      decisionReason: decision?.reason ?? null,
      aliases: aliasesBySkill.get(mapping.skillId) ?? [],
      evidenceKind,
      decisionBasisHash: skillDecisionBasis(mapping.skillId, mapping.skillKey, snapshot),
      previousDecisionId: decision?.previousDecisionId ?? null,
    }
    const prior = grouped.get(mapping.skillId)
    if (prior) {
      if (!prior.requirementStatement.includes(mapping.requirementStatement))
        prior.requirementStatement += `\n${mapping.requirementStatement}`
      if (rank[current.importance] > rank[prior.importance]) prior.importance = current.importance
    } else grouped.set(mapping.skillId, current)
  }
  // Evaluate the final skill-wide kind, not each requirement independently.
  for (const row of grouped.values()) {
    if (row.decision === 'include' && !row.decisionReason?.trim()) row.decision = 'pending'
  }
  return [...grouped.values()]
}
