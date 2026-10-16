import { and, eq, sql } from 'drizzle-orm'
import { nowISO } from '../lib/date'
import { normalizeSkillAlias } from '../lib/skills/normalize'
import { resolveSkillInput, type SkillResolver } from '../lib/skills/resolve'
import type { SkillCategory } from '../lib/skills/taxonomy'
import { db } from './client'
import {
  analysisRunDecisions,
  careerAchievementSkills,
  careerProjectSkills,
  careerSkills,
  jobRequirementSkillMentions,
  jobRequirementsToSkills,
  type Skill,
  skillAliases,
  skills,
} from './schema'
import {
  assertSkillLabelAvailable,
  type DbExecutor,
  resolveSkillByAlias,
  resolveSkillByKey,
} from './skill-queries'

export { assertSkillLabelAvailable } from './skill-queries'

export type SkillDb = Pick<typeof db, 'select' | 'insert' | 'delete' | 'update' | 'transaction'>

export type MergeConflict = {
  runId: number
  sourceDecision: 'skip' | 'include'
  targetDecision: 'skip' | 'include'
}

function resolverFor(tx: DbExecutor): SkillResolver {
  return {
    byAlias: (normalized) => resolveSkillByAlias(tx, normalized),
    byKey: (key) => resolveSkillByKey(tx, key),
  }
}

export function resolveSkillByName(tx: DbExecutor, input: string): Skill | undefined {
  return (
    resolveSkillInput(resolverFor(tx), input) ??
    tx
      .select()
      .from(skills)
      .all()
      .find((row) => normalizeSkillAlias(row.name) === normalizeSkillAlias(input))
  )
}

function requireActiveSkill(tx: DbExecutor, id: number, allowLegacyMerged = false): Skill {
  const skill = tx.select().from(skills).where(eq(skills.id, id)).get()
  if (!skill) throw new Error('Skill not found.')
  if (skill.reviewStatus === 'merged' && !allowLegacyMerged)
    throw new Error('A merged skill cannot be changed.')
  return skill
}

export function approveSkill(id: number, executor: SkillDb = db) {
  executor
    .update(skills)
    .set({ reviewStatus: 'approved', updatedAt: nowISO() })
    .where(eq(skills.id, id))
    .run()
}

export function rejectSkill(id: number, executor: SkillDb = db) {
  executor
    .update(skills)
    .set({ reviewStatus: 'rejected', updatedAt: nowISO() })
    .where(eq(skills.id, id))
    .run()
}

export function recategorizeSkill(id: number, category: SkillCategory, executor: SkillDb = db) {
  executor.update(skills).set({ category, updatedAt: nowISO() }).where(eq(skills.id, id)).run()
}

export function renameSkill(id: number, name: string, executor: SkillDb = db) {
  const date = nowISO()
  executor.transaction((tx) => {
    requireActiveSkill(tx, id)
    assertSkillLabelAvailable(tx, name, [id])
    tx.update(skills).set({ name, updatedAt: date }).where(eq(skills.id, id)).run()
  })
}

export function replaceSkillAliases(skillId: number, aliases: string[], executor: SkillDb = db) {
  executor.transaction((tx) => {
    requireActiveSkill(tx, skillId)
    for (const alias of aliases) assertSkillLabelAvailable(tx, alias, [skillId])
    tx.delete(skillAliases).where(eq(skillAliases.skillId, skillId)).run()
    for (const alias of aliases) addSkillAlias(skillId, alias.trim(), 'manual', tx)
  })
}

export function listSkillAliases(skillId: number, executor: DbExecutor = db) {
  return executor
    .select()
    .from(skillAliases)
    .where(eq(skillAliases.skillId, skillId))
    .all()
    .map((row) => row.alias)
}

export function addSkillAlias(
  skillId: number,
  alias: string,
  origin = 'manual' as const,
  executor: SkillDb = db,
) {
  assertSkillLabelAvailable(executor, alias, [skillId])
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
      createdAt: nowISO(),
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

export function mergeSkills(
  sourceId: number,
  targetId: number,
  executor: SkillDb = db,
  personalResolution?: 'source' | 'target',
) {
  if (sourceId === targetId) throw new Error('A skill cannot be merged into itself.')

  const date = nowISO()
  return executor.transaction((tx) => {
    const source = requireActiveSkill(tx, sourceId, true)
    const target = requireActiveSkill(tx, targetId)
    for (const label of [source.name, source.key]) {
      const normalized = normalizeSkillAlias(label)
      const owner = tx
        .select()
        .from(skillAliases)
        .where(eq(skillAliases.normalizedAlias, normalized))
        .get()
      const keyOwner = tx.select().from(skills).where(eq(skills.key, normalized)).get()
      if (
        (owner && owner.skillId !== sourceId && owner.skillId !== targetId) ||
        (keyOwner && keyOwner.id !== sourceId && keyOwner.id !== targetId)
      )
        throw new Error(`Alias "${label}" is owned by another skill.`)
      // The source still exists until all references have moved.
      assertSkillLabelAvailable(tx, label, [sourceId, targetId])
      if (!owner)
        tx.insert(skillAliases)
          .values({
            skillId: targetId,
            alias: label,
            normalizedAlias: normalized,
            origin: 'manual',
            createdAt: date,
          })
          .run()
    }

    // Transfer concrete career FKs as well as requirement mappings.
    for (const table of [careerAchievementSkills, careerProjectSkills]) {
      const entityColumn = 'achievementId' in table ? table.achievementId : table.projectId
      for (const link of tx.select().from(table).where(eq(table.skillId, sourceId)).all()) {
        const entityId = 'achievementId' in link ? link.achievementId : link.projectId
        const collision = tx
          .select()
          .from(table)
          .where(and(eq(entityColumn, entityId), eq(table.skillId, targetId)))
          .get()
        if (collision)
          tx.delete(table)
            .where(and(eq(entityColumn, entityId), eq(table.skillId, sourceId)))
            .run()
        else
          tx.update(table)
            .set({ skillId: targetId })
            .where(and(eq(entityColumn, entityId), eq(table.skillId, sourceId)))
            .run()
      }
    }
    const personalSource = tx
      .select()
      .from(careerSkills)
      .where(eq(careerSkills.skillId, sourceId))
      .get()
    const personalTarget = tx
      .select()
      .from(careerSkills)
      .where(eq(careerSkills.skillId, targetId))
      .get()
    if (personalSource && personalTarget) {
      const differs =
        personalSource.level !== personalTarget.level ||
        personalSource.resumeEligible !== personalTarget.resumeEligible ||
        personalSource.retiredAt !== personalTarget.retiredAt
      if (differs && !personalResolution)
        throw new Error(
          'Personal proficiency or eligibility differs. Choose which personal skill settings to retain.',
        )
      const selected = personalResolution === 'source' ? personalSource : personalTarget
      const sourceEvidence = JSON.parse(personalSource.evidenceJson) as string[]
      const targetEvidence = JSON.parse(personalTarget.evidenceJson) as string[]
      const extensions = JSON.parse(personalTarget.extensionJson ?? '{}') as Record<string, unknown>
      const mergedSources = Array.isArray(extensions.mergedSources) ? extensions.mergedSources : []
      tx.update(careerSkills)
        .set({
          level: selected.level,
          resumeEligible: selected.resumeEligible,
          retiredAt: selected.retiredAt,
          evidenceJson: JSON.stringify([...new Set([...targetEvidence, ...sourceEvidence])]),
          explanation:
            [personalTarget.explanation, personalSource.explanation].filter(Boolean).join('\n\n') ||
            null,
          notes: [personalTarget.notes, personalSource.notes].filter(Boolean).join('\n\n') || null,
          extensionJson: JSON.stringify({
            ...extensions,
            mergedSources: [
              ...mergedSources,
              { sourceSkillKey: source.key, record: personalSource },
            ],
          }),
          revision: personalTarget.revision + 1,
          updatedAt: date,
        })
        .where(eq(careerSkills.id, personalTarget.id))
        .run()
      tx.delete(careerSkills).where(eq(careerSkills.id, personalSource.id)).run()
    } else if (personalSource) {
      tx.update(careerSkills)
        .set({ skillId: targetId, revision: personalSource.revision + 1, updatedAt: date })
        .where(eq(careerSkills.id, personalSource.id))
        .run()
    }

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

    // Requirement mappings are owned by the mentions; moving the mention's
    // resolved skill is enough and never rewrites `normalized_term`, so the
    // (job_requirement_id, normalized_term) unique index cannot collide even
    // when the requirement already maps a different term to the target.
    const sourceMentions = tx
      .select()
      .from(jobRequirementSkillMentions)
      .where(eq(jobRequirementSkillMentions.resolvedSkillId, sourceId))
      .all()
    for (const mention of sourceMentions) {
      tx.update(jobRequirementSkillMentions)
        .set({ resolvedSkillId: targetId, revision: mention.revision + 1, updatedAt: date })
        .where(eq(jobRequirementSkillMentions.id, mention.id))
        .run()
    }

    const sourceDecisions = tx
      .select()
      .from(analysisRunDecisions)
      .where(eq(analysisRunDecisions.skillId, sourceId))
      .all()
    for (const decision of sourceDecisions) {
      const targetDecision = tx
        .select()
        .from(analysisRunDecisions)
        .where(
          and(
            eq(analysisRunDecisions.applicationAnalysisRunId, decision.applicationAnalysisRunId),
            eq(analysisRunDecisions.skillId, targetId),
          ),
        )
        .get()
      if (targetDecision) {
        const selected = targetDecision.decision === 'pending' ? decision : targetDecision
        tx.update(analysisRunDecisions)
          .set({
            decision: selected.decision,
            reason: selected.reason,
            includeBasis: selected.includeBasis,
            basisHash: null,
            updatedAt: date,
          })
          .where(eq(analysisRunDecisions.id, targetDecision.id))
          .run()
        tx.update(analysisRunDecisions)
          .set({ previousDecisionId: targetDecision.id })
          .where(
            and(
              eq(analysisRunDecisions.previousDecisionId, decision.id),
              sql`${analysisRunDecisions.id} != ${targetDecision.id}`,
            ),
          )
          .run()
        tx.delete(analysisRunDecisions).where(eq(analysisRunDecisions.id, decision.id)).run()
        continue
      }
      tx.update(analysisRunDecisions)
        .set({ skillId: targetId, basisHash: null, updatedAt: date })
        .where(eq(analysisRunDecisions.id, decision.id))
        .run()
    }

    // Legacy redirect rows may still point at the source. Keep them valid;
    // new merges never create redirect rows.
    tx.update(skills)
      .set({ mergedIntoSkillId: targetId })
      .where(eq(skills.mergedIntoSkillId, sourceId))
      .run()
    tx.delete(skills).where(eq(skills.id, sourceId)).run()
    return { sourceId: source.id, targetId: target.id }
  })
}

/** Explicit one-time cleanup for redirects created by older versions. */
export function consolidateLegacyMergedSkills(executor: SkillDb = db) {
  return executor.transaction((tx) => {
    const legacy = tx
      .select()
      .from(skills)
      .all()
      .filter((row) => row.reviewStatus === 'merged')
    for (const source of legacy) {
      const current = requireActiveSkill(tx, source.id, true)
      let target = requireActiveSkill(tx, current.mergedIntoSkillId!, true)
      const seen = new Set([source.id])
      while (target.reviewStatus === 'merged') {
        if (seen.has(target.id))
          throw new Error('Circular legacy skill merge. No changes were saved.')
        seen.add(target.id)
        target = requireActiveSkill(tx, target.mergedIntoSkillId!, true)
      }
      mergeSkills(source.id, target.id, tx, 'target')
    }
    return legacy.length
  })
}
