import { and, eq, notInArray } from 'drizzle-orm'
import { todayISO } from '../lib/date'
import type { SkillCategory, SkillOrigin, SkillReviewStatus } from '../lib/skills/constants'
import { normalizeSkillAlias } from '../lib/skills/normalize'
import { db } from './client'
import { jobApplicationsToSkills, type Skill, skillAliases, skills } from './schema'

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
