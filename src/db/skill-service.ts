import { and, eq } from 'drizzle-orm'
import type { CanonicalCareerData } from '../lib/career-data'
import { todayISO } from '../lib/date'
import type { SkillCategory } from '../lib/skills/constants'
import { determineMatchResult } from '../lib/skills/match-career-skills'
import { normalizeSkillAlias } from '../lib/skills/normalize'
import { resolveSkillInput, type SkillResolver } from '../lib/skills/resolve'
import { db } from './client'
import { jobApplicationsToSkills, type Skill, skillAliases, skills } from './schema'
import { type DbExecutor, resolveSkillByAlias, resolveSkillByKey } from './skill-queries'

export type SkillDb = Pick<typeof db, 'select' | 'insert' | 'delete' | 'update' | 'transaction'>

export type MergeConflict = {
  applicationId: number
  sourceDecision: 'skip' | 'include'
  targetDecision: 'skip' | 'include'
}

export class MergeConflictError extends Error {
  constructor(readonly conflicts: MergeConflict[]) {
    super('Cannot merge: one or more applications have conflicting user decisions.')
  }
}

const importanceRank = { mentioned: 0, preferred: 1, required: 2 } as const

function isDecided(value: string): value is 'skip' | 'include' {
  return value === 'skip' || value === 'include'
}

function resolverFor(tx: DbExecutor): SkillResolver {
  return {
    byAlias: (normalized) => resolveSkillByAlias(tx, normalized),
    byKey: (key) => resolveSkillByKey(tx, key),
  }
}

export function resolveSkillByName(tx: DbExecutor, input: string): Skill | undefined {
  return resolveSkillInput(resolverFor(tx), input)
}

function requireActiveSkill(tx: DbExecutor, id: number): Skill {
  const skill = tx.select().from(skills).where(eq(skills.id, id)).get()
  if (!skill) throw new Error('Skill not found.')
  if (skill.reviewStatus === 'merged') throw new Error('A merged skill cannot be changed.')
  return skill
}

export function approveSkill(id: number, executor: SkillDb = db) {
  executor
    .update(skills)
    .set({ reviewStatus: 'approved', updatedAt: todayISO() })
    .where(eq(skills.id, id))
    .run()
}

export function rejectSkill(id: number, executor: SkillDb = db) {
  executor
    .update(skills)
    .set({ reviewStatus: 'rejected', updatedAt: todayISO() })
    .where(eq(skills.id, id))
    .run()
}

export function recategorizeSkill(id: number, category: SkillCategory, executor: SkillDb = db) {
  executor.update(skills).set({ category, updatedAt: todayISO() }).where(eq(skills.id, id)).run()
}

export function renameSkill(id: number, name: string, executor: SkillDb = db) {
  const date = todayISO()
  executor.transaction((tx) => {
    const skill = requireActiveSkill(tx, id)
    const key = skill.careerSkillId ?? normalizeSkillAlias(name)
    tx.update(skills).set({ name, key, updatedAt: date }).where(eq(skills.id, id)).run()
  })
}

export function addSkillAlias(
  skillId: number,
  alias: string,
  origin = 'manual' as const,
  executor: SkillDb = db,
) {
  const normalized = normalizeSkillAlias(alias)
  const existing = executor
    .select()
    .from(skillAliases)
    .where(eq(skillAliases.normalizedAlias, normalized))
    .get()
  if (existing) {
    if (existing.skillId === skillId) return
    throw new Error(`Alias "${alias}" is already used by another skill.`)
  }
  executor
    .insert(skillAliases)
    .values({
      skillId,
      alias,
      normalizedAlias: normalized,
      origin,
      createdAt: todayISO(),
    })
    .run()
}

export function previewMerge(sourceId: number, targetId: number, executor: SkillDb = db) {
  const sourceRelations = executor
    .select()
    .from(jobApplicationsToSkills)
    .where(eq(jobApplicationsToSkills.skillId, sourceId))
    .all()
  const targetRelations = executor
    .select()
    .from(jobApplicationsToSkills)
    .where(eq(jobApplicationsToSkills.skillId, targetId))
    .all()
  const targetByApplication = new Map(
    targetRelations.map((relation) => [relation.jobApplicationId, relation]),
  )
  const conflicts: MergeConflict[] = []
  for (const source of sourceRelations) {
    const target = targetByApplication.get(source.jobApplicationId)
    if (
      target &&
      isDecided(source.userDecision) &&
      isDecided(target.userDecision) &&
      source.userDecision !== target.userDecision
    ) {
      conflicts.push({
        applicationId: source.jobApplicationId,
        sourceDecision: source.userDecision,
        targetDecision: target.userDecision,
      })
    }
  }
  return {
    aliasCount: executor.select().from(skillAliases).where(eq(skillAliases.skillId, sourceId)).all()
      .length,
    applicationCount: sourceRelations.length,
    conflicts,
  }
}

export function mergeSkills(sourceId: number, targetId: number, executor: SkillDb = db) {
  if (sourceId === targetId) throw new Error('A skill cannot be merged into itself.')
  const conflicts = previewMerge(sourceId, targetId, executor).conflicts
  if (conflicts.length) throw new MergeConflictError(conflicts)

  const date = todayISO()
  return executor.transaction((tx) => {
    const source = requireActiveSkill(tx, sourceId)
    const target = requireActiveSkill(tx, targetId)

    const sourceAliases = tx
      .select()
      .from(skillAliases)
      .where(eq(skillAliases.skillId, sourceId))
      .all()
    for (const alias of sourceAliases) {
      const existing = tx
        .select()
        .from(skillAliases)
        .where(eq(skillAliases.normalizedAlias, alias.normalizedAlias))
        .get()
      if (existing?.skillId === targetId) continue
      if (existing && existing.skillId !== sourceId)
        throw new Error(`Alias "${alias.alias}" is already used by another skill.`)
      tx.update(skillAliases).set({ skillId: targetId }).where(eq(skillAliases.id, alias.id)).run()
    }

    const sourceRelations = tx
      .select()
      .from(jobApplicationsToSkills)
      .where(eq(jobApplicationsToSkills.skillId, sourceId))
      .all()
    for (const sourceRelation of sourceRelations) {
      const targetRelation = tx
        .select()
        .from(jobApplicationsToSkills)
        .where(
          and(
            eq(jobApplicationsToSkills.jobApplicationId, sourceRelation.jobApplicationId),
            eq(jobApplicationsToSkills.skillId, targetId),
          ),
        )
        .get()
      if (!targetRelation) {
        tx.update(jobApplicationsToSkills)
          .set({ skillId: targetId, updatedAt: date })
          .where(
            and(
              eq(jobApplicationsToSkills.jobApplicationId, sourceRelation.jobApplicationId),
              eq(jobApplicationsToSkills.skillId, sourceId),
            ),
          )
          .run()
        continue
      }
      const keepTargetDecision = isDecided(targetRelation.userDecision)
      const keptDecision = keepTargetDecision
        ? targetRelation.userDecision
        : sourceRelation.userDecision
      const keptReason = keepTargetDecision
        ? targetRelation.decisionReason
        : sourceRelation.decisionReason
      const sourceRank = importanceRank[sourceRelation.importance]
      const targetRank = importanceRank[targetRelation.importance]
      tx.update(jobApplicationsToSkills)
        .set({
          rawLabel: targetRelation.rawLabel ?? sourceRelation.rawLabel,
          sourceText: targetRelation.sourceText ?? sourceRelation.sourceText,
          importance:
            sourceRank > targetRank ? sourceRelation.importance : targetRelation.importance,
          analysisResult:
            sourceRelation.analysisResult === 'proven-match' ||
            targetRelation.analysisResult === 'proven-match'
              ? 'proven-match'
              : targetRelation.analysisResult,
          userDecision: keptDecision,
          decisionReason: keptReason,
          updatedAt: date,
        })
        .where(
          and(
            eq(jobApplicationsToSkills.jobApplicationId, targetRelation.jobApplicationId),
            eq(jobApplicationsToSkills.skillId, targetId),
          ),
        )
        .run()
      tx.delete(jobApplicationsToSkills)
        .where(
          and(
            eq(jobApplicationsToSkills.jobApplicationId, sourceRelation.jobApplicationId),
            eq(jobApplicationsToSkills.skillId, sourceId),
          ),
        )
        .run()
    }

    tx.update(skills)
      .set({ reviewStatus: 'merged', mergedIntoSkillId: targetId, updatedAt: date })
      .where(eq(skills.id, sourceId))
      .run()
    return { sourceId: source.id, targetId: target.id }
  })
}

/**
 * Recomputes the two-state analysis result for every stored application skill
 * requirement from current career-data truth. This runs after an explicit
 * career sync or application reanalysis and never touches frozen generation
 * snapshots.
 */
export function recomputeMatchResults(
  executor: SkillDb = db,
  careerData: Pick<CanonicalCareerData, 'skills'>,
) {
  const date = todayISO()
  const relations = executor.select().from(jobApplicationsToSkills).all()
  return executor.transaction((tx) => {
    for (const relation of relations) {
      const skill = tx.select().from(skills).where(eq(skills.id, relation.skillId)).get()
      const result = determineMatchResult(skill?.careerSkillId ?? null, careerData)
      if (relation.analysisResult !== result) {
        tx.update(jobApplicationsToSkills)
          .set({ analysisResult: result, updatedAt: date })
          .where(
            and(
              eq(jobApplicationsToSkills.jobApplicationId, relation.jobApplicationId),
              eq(jobApplicationsToSkills.skillId, relation.skillId),
            ),
          )
          .run()
      }
    }
  })
}
