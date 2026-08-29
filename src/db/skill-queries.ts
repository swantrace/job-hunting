import { and, eq, inArray, notInArray } from 'drizzle-orm'
import { todayISO } from '../lib/date'
import type { SkillImportance, SkillOrigin, SkillReviewStatus } from '../lib/skills/constants'
import { normalizeSkillAlias } from '../lib/skills/normalize'
import type { SkillCategory } from '../lib/skills/taxonomy'
import { db } from './client'
import { jobApplicationsToSkills, type Skill, skillAliases, skills } from './schema'

export type DbExecutor = Pick<typeof db, 'select' | 'insert' | 'delete' | 'update'>

export type SkillRequirementInput = {
  rawLabel: string
  canonicalLabel: string
  category: SkillCategory | null
  importance: SkillImportance
  sourceText?: string | null
  confidence?: number | null
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

function resolveApprovedSkill(tx: DbExecutor, normalized: string): Skill | undefined {
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

function addAliasIfAbsent(tx: DbExecutor, skillId: number, alias: string, origin: SkillOrigin) {
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

/**
 * Persists structured parser requirements for one application. Approved skills
 * are reused, unknown concepts become pending skills only at save time, and
 * repeated canonical skills collapse into a single relation. The relationship
 * stores raw label, source excerpt, importance, confidence, and analysis result.
 */
export function persistSkillRequirements(
  tx: DbExecutor,
  jobId: number,
  requirements: SkillRequirementInput[],
) {
  const date = todayISO()
  const seen = new Set<string>()
  const skillIdByCanonical = new Map<string, number>()
  const rawLabelBySkillId = new Map<number, string>()

  for (const requirement of requirements) {
    const canonicalLabel = requirement.canonicalLabel.trim() || requirement.rawLabel.trim()
    const canonical = normalizeSkillAlias(canonicalLabel)
    if (seen.has(canonical)) continue
    seen.add(canonical)

    let skill = resolveApprovedSkill(tx, canonical)
    if (!skill) {
      skill = resolveSkillByKey(tx, canonical) ?? resolveSkillByAlias(tx, canonical)
    }
    if (!skill) {
      skill = insertSkill(tx, {
        name: canonicalLabel,
        category: requirement.category,
        reviewStatus: 'pending',
        origin: 'job-parser',
      })
    }
    const rawLabel = requirement.rawLabel.trim() || canonicalLabel
    addAliasIfAbsent(tx, skill.id, rawLabel, 'job-parser')
    skillIdByCanonical.set(canonical, skill.id)
    rawLabelBySkillId.set(skill.id, rawLabel)

    tx.insert(jobApplicationsToSkills)
      .values({
        jobApplicationId: jobId,
        skillId: skill.id,
        rawLabel,
        sourceText: requirement.sourceText?.trim() || null,
        importance: requirement.importance,
        parserConfidence: requirement.confidence ?? null,
        analysisResult: skill.careerSkillId ? 'proven-match' : 'not-in-career-data',
        userDecision: 'pending',
        createdAt: date,
        updatedAt: date,
      })
      .onConflictDoNothing()
      .run()
  }

  const skillIds = [...skillIdByCanonical.values()]
  if (skillIds.length) {
    tx.delete(jobApplicationsToSkills)
      .where(
        and(
          eq(jobApplicationsToSkills.jobApplicationId, jobId),
          notInArray(jobApplicationsToSkills.skillId, skillIds),
        ),
      )
      .run()
  } else {
    tx.delete(jobApplicationsToSkills)
      .where(eq(jobApplicationsToSkills.jobApplicationId, jobId))
      .run()
  }
}

/**
 * Reconciles an application's skill requirements by canonical skill ID while
 * preserving user decisions for skills that remain present. Rows for skills no
 * longer in the list are removed only for this application; other applications
 * and their decisions are never touched.
 */
export function reconcileSkillNames(tx: DbExecutor, jobId: number, names: string[]) {
  const date = todayISO()
  const rawLabelBySkillId = new Map<number, string>()
  for (const name of names) {
    const skill = getOrCreateSkill(tx, name, 'manual')
    if (!rawLabelBySkillId.has(skill.id)) rawLabelBySkillId.set(skill.id, name)
  }
  for (const [skillId, rawLabel] of rawLabelBySkillId) {
    tx.insert(jobApplicationsToSkills)
      .values({
        jobApplicationId: jobId,
        skillId,
        rawLabel,
        importance: 'mentioned',
        analysisResult: 'not-in-career-data',
        userDecision: 'pending',
        createdAt: date,
        updatedAt: date,
      })
      .onConflictDoNothing()
      .run()
  }
  const skillIds = [...rawLabelBySkillId.keys()]
  if (skillIds.length) {
    tx.delete(jobApplicationsToSkills)
      .where(
        and(
          eq(jobApplicationsToSkills.jobApplicationId, jobId),
          notInArray(jobApplicationsToSkills.skillId, skillIds),
        ),
      )
      .run()
  } else {
    tx.delete(jobApplicationsToSkills)
      .where(eq(jobApplicationsToSkills.jobApplicationId, jobId))
      .run()
  }
}

export type ApplicationSkillRequirement = typeof jobApplicationsToSkills.$inferSelect & {
  skillName: string
  skillKey: string
  skillCategory: SkillCategory | null
  careerSkillId: string | null
  reviewStatus: SkillReviewStatus
  aliases: string[]
}

export function listApplicationSkillRequirements(jobId: number): ApplicationSkillRequirement[] {
  const relations = db
    .select()
    .from(jobApplicationsToSkills)
    .where(eq(jobApplicationsToSkills.jobApplicationId, jobId))
    .all()
  if (!relations.length) return []
  const skillIds = relations.map((relation) => relation.skillId)
  const skillRows = db.select().from(skills).where(inArray(skills.id, skillIds)).all()
  const aliasRows = db
    .select()
    .from(skillAliases)
    .where(inArray(skillAliases.skillId, skillIds))
    .all()
  const skillById = new Map(skillRows.map((skill) => [skill.id, skill]))
  const aliasesBySkill = new Map<number, string[]>()
  for (const alias of aliasRows) {
    const list = aliasesBySkill.get(alias.skillId) ?? []
    list.push(alias.alias)
    aliasesBySkill.set(alias.skillId, list)
  }
  return relations.map((relation) => {
    const skill = skillById.get(relation.skillId)
    return {
      ...relation,
      skillName: skill?.name ?? relation.rawLabel ?? '',
      skillKey: skill?.key ?? '',
      skillCategory: skill?.category ?? null,
      careerSkillId: skill?.careerSkillId ?? null,
      reviewStatus: skill?.reviewStatus ?? 'pending',
      aliases: aliasesBySkill.get(relation.skillId) ?? [],
    }
  })
}

export function getApplicationSkillRequirement(
  jobId: number,
  skillId: number,
): ApplicationSkillRequirement | undefined {
  return listApplicationSkillRequirements(jobId).find((item) => item.skillId === skillId)
}

export function updateSkillDecision(
  jobId: number,
  skillId: number,
  decision: 'skip' | 'include',
  reason: string | null,
) {
  db.update(jobApplicationsToSkills)
    .set({
      userDecision: decision,
      decisionReason: decision === 'include' ? reason : null,
      updatedAt: todayISO(),
    })
    .where(
      and(
        eq(jobApplicationsToSkills.jobApplicationId, jobId),
        eq(jobApplicationsToSkills.skillId, skillId),
      ),
    )
    .run()
}

export function skipRemainingSkillDecisions(jobId: number) {
  db.update(jobApplicationsToSkills)
    .set({ userDecision: 'skip', decisionReason: null, updatedAt: todayISO() })
    .where(
      and(
        eq(jobApplicationsToSkills.jobApplicationId, jobId),
        eq(jobApplicationsToSkills.analysisResult, 'not-in-career-data'),
        eq(jobApplicationsToSkills.userDecision, 'pending'),
      ),
    )
    .run()
}

export function hasPendingSkillDecisions(jobId: number) {
  return !!db
    .select({ skillId: jobApplicationsToSkills.skillId })
    .from(jobApplicationsToSkills)
    .where(
      and(
        eq(jobApplicationsToSkills.jobApplicationId, jobId),
        eq(jobApplicationsToSkills.analysisResult, 'not-in-career-data'),
        eq(jobApplicationsToSkills.userDecision, 'pending'),
      ),
    )
    .limit(1)
    .get()
}
