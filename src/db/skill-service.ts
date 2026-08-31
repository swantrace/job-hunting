import { and, eq } from 'drizzle-orm'
import { todayISO } from '../lib/date'
import { normalizeSkillAlias } from '../lib/skills/normalize'
import { resolveSkillInput, type SkillResolver } from '../lib/skills/resolve'
import type { SkillCategory } from '../lib/skills/taxonomy'
import { db } from './client'
import {
  analysisRunDecisions,
  jobRequirementsToSkills,
  type Skill,
  skillAliases,
  skills,
} from './schema'
import { type DbExecutor, resolveSkillByAlias, resolveSkillByKey } from './skill-queries'

export type SkillDb = Pick<typeof db, 'select' | 'insert' | 'delete' | 'update' | 'transaction'>

export type MergeConflict = {
  runId: number
  sourceDecision: 'skip' | 'include'
  targetDecision: 'skip' | 'include'
}

export class MergeConflictError extends Error {
  constructor(readonly conflicts: MergeConflict[]) {
    super('Cannot merge: one or more analysis runs have conflicting decisions.')
  }
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
    tx.update(skills).set({ name, updatedAt: date }).where(eq(skills.id, id)).run()
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

function isDecided(value: string): value is 'skip' | 'include' {
  return value === 'skip' || value === 'include'
}

export function previewMerge(sourceId: number, targetId: number, executor: SkillDb = db) {
  const sourceLinks = executor
    .select()
    .from(jobRequirementsToSkills)
    .where(eq(jobRequirementsToSkills.skillId, sourceId))
    .all()
  const sourceDecisions = executor
    .select()
    .from(analysisRunDecisions)
    .where(eq(analysisRunDecisions.skillId, sourceId))
    .all()
  const targetDecisions = executor
    .select()
    .from(analysisRunDecisions)
    .where(eq(analysisRunDecisions.skillId, targetId))
    .all()
  const targetByRun = new Map(
    targetDecisions.map((decision) => [decision.applicationAnalysisRunId, decision]),
  )
  const conflicts: MergeConflict[] = []
  for (const source of sourceDecisions) {
    const target = targetByRun.get(source.applicationAnalysisRunId)
    if (
      target &&
      isDecided(source.decision) &&
      isDecided(target.decision) &&
      source.decision !== target.decision
    ) {
      conflicts.push({
        runId: source.applicationAnalysisRunId,
        sourceDecision: source.decision,
        targetDecision: target.decision,
      })
    }
  }
  return {
    aliasCount: executor.select().from(skillAliases).where(eq(skillAliases.skillId, sourceId)).all()
      .length,
    requirementCount: sourceLinks.length,
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

    const sourceLinks = tx
      .select()
      .from(jobRequirementsToSkills)
      .where(eq(jobRequirementsToSkills.skillId, sourceId))
      .all()
    for (const link of sourceLinks) {
      const targetLink = tx
        .select()
        .from(jobRequirementsToSkills)
        .where(
          and(
            eq(jobRequirementsToSkills.jobRequirementId, link.jobRequirementId),
            eq(jobRequirementsToSkills.skillId, targetId),
          ),
        )
        .get()
      if (targetLink) {
        tx.delete(jobRequirementsToSkills)
          .where(
            and(
              eq(jobRequirementsToSkills.jobRequirementId, link.jobRequirementId),
              eq(jobRequirementsToSkills.skillId, sourceId),
            ),
          )
          .run()
        continue
      }
      tx.update(jobRequirementsToSkills)
        .set({ skillId: targetId })
        .where(
          and(
            eq(jobRequirementsToSkills.jobRequirementId, link.jobRequirementId),
            eq(jobRequirementsToSkills.skillId, sourceId),
          ),
        )
        .run()
    }

    const sourceDecisions = tx
      .select()
      .from(analysisRunDecisions)
      .where(eq(analysisRunDecisions.skillId, sourceId))
      .all()
    for (const decision of sourceDecisions) {
      tx.update(analysisRunDecisions)
        .set({ skillId: targetId, updatedAt: date })
        .where(eq(analysisRunDecisions.id, decision.id))
        .run()
    }

    tx.update(skills)
      .set({ reviewStatus: 'merged', mergedIntoSkillId: targetId, updatedAt: date })
      .where(eq(skills.id, sourceId))
      .run()
    return { sourceId: source.id, targetId: target.id }
  })
}
