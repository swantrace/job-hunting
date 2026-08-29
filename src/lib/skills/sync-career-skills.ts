import { eq } from 'drizzle-orm'
import { type Skill, skillAliases, skills } from '../../db/schema'
import type { DbExecutor } from '../../db/skill-queries'
import type { SkillDb } from '../../db/skill-service'
import { todayISO } from '../date'
import type { SkillOrigin } from './constants'
import { normalizeSkillAlias } from './normalize'
import type { SkillCategory } from './taxonomy'

export type CareerSkillInput = {
  id: string
  label: string
  category: SkillCategory
  aliases: string[]
}
export type CareerSkillsInput = { skills: { skills: CareerSkillInput[] } }

export type SyncReport = {
  inserted: number
  linked: number
  updated: number
  unchanged: number
  conflicted: number
  conflicts: string[]
}

function emptyReport(): SyncReport {
  return { inserted: 0, linked: 0, updated: 0, unchanged: 0, conflicted: 0, conflicts: [] }
}

function insertAlias(
  tx: DbExecutor,
  skillId: number,
  alias: string,
  origin: SkillOrigin,
  date: string,
) {
  const normalized = normalizeSkillAlias(alias)
  const existing = tx
    .select()
    .from(skillAliases)
    .where(eq(skillAliases.normalizedAlias, normalized))
    .get()
  if (existing) return
  tx.insert(skillAliases)
    .values({ skillId, alias, normalizedAlias: normalized, origin, createdAt: date })
    .run()
}

function createCareerSkill(tx: DbExecutor, career: CareerSkillInput, date: string) {
  const skill = tx
    .insert(skills)
    .values({
      key: career.id,
      name: career.label,
      category: career.category,
      reviewStatus: 'approved',
      origin: 'career-data',
      careerSkillId: career.id,
      createdAt: date,
      updatedAt: date,
    })
    .returning()
    .get()
  for (const alias of career.aliases ?? []) insertAlias(tx, skill.id, alias, 'career-data', date)
}

function linkCareerSkill(tx: DbExecutor, match: Skill, career: CareerSkillInput, date: string) {
  tx.update(skills)
    .set({
      key: career.id,
      name: career.label,
      category: career.category,
      reviewStatus: 'approved',
      careerSkillId: career.id,
      updatedAt: date,
    })
    .where(eq(skills.id, match.id))
    .run()
  for (const alias of career.aliases ?? []) insertAlias(tx, match.id, alias, 'career-data', date)
}

function updateCareerSkill(tx: DbExecutor, match: Skill, career: CareerSkillInput, date: string) {
  tx.update(skills)
    .set({
      key: career.id,
      name: career.label,
      category: career.category,
      reviewStatus: 'approved',
      updatedAt: date,
    })
    .where(eq(skills.id, match.id))
    .run()
  for (const alias of career.aliases ?? []) insertAlias(tx, match.id, alias, 'career-data', date)
}

/**
 * Synchronizes career-data skills into the operational taxonomy. The sync is
 * one-way and idempotent: it links or creates approved skills but never deletes
 * or rejects taxonomy skills that are absent from career data, and never copies
 * evidence, levels, directions, or review notes into taxonomy tables.
 */
export function syncCareerSkills(
  executor: SkillDb,
  data: CareerSkillsInput,
  options: { apply?: boolean } = {},
): SyncReport {
  const apply = options.apply ?? false
  const date = todayISO()
  const report = emptyReport()

  const run = (tx: DbExecutor) => {
    const allSkills = tx.select().from(skills).all()
    // Merged skills are redirects, not live concepts: never resolve a career
    // skill to a merged source row.
    const activeSkills = allSkills.filter((skill) => skill.reviewStatus !== 'merged')
    const activeSkillIds = new Set(activeSkills.map((skill) => skill.id))
    const allAliases = tx.select().from(skillAliases).all()
    const byCareerId = new Map(
      activeSkills
        .filter((skill) => skill.careerSkillId)
        .map((skill) => [skill.careerSkillId, skill]),
    )
    const byKey = new Map(activeSkills.map((skill) => [skill.key, skill]))
    const byName = new Map(activeSkills.map((skill) => [normalizeSkillAlias(skill.name), skill]))
    const byAlias = new Map(
      allAliases
        .filter((alias) => activeSkillIds.has(alias.skillId))
        .map((alias) => [alias.normalizedAlias, alias]),
    )
    const skillById = new Map(activeSkills.map((skill) => [skill.id, skill]))

    for (const career of data.skills.skills) {
      const existing = byCareerId.get(career.id)
      if (existing) {
        const changed =
          existing.name !== career.label ||
          existing.category !== career.category ||
          existing.reviewStatus !== 'approved' ||
          existing.key !== career.id
        if (changed) {
          if (apply) updateCareerSkill(tx, existing, career, date)
          report.updated += 1
        } else {
          report.unchanged += 1
          if (apply)
            for (const alias of career.aliases ?? [])
              insertAlias(tx, existing.id, alias, 'career-data', date)
        }
        continue
      }

      const matchIds = new Set<number>()
      for (const candidate of [career.id, career.label, ...(career.aliases ?? [])]) {
        const normalized = normalizeSkillAlias(candidate)
        const keyMatch = byKey.get(normalized)
        if (keyMatch) matchIds.add(keyMatch.id)
        const nameMatch = byName.get(normalized)
        if (nameMatch) matchIds.add(nameMatch.id)
        const aliasMatch = byAlias.get(normalized)
        if (aliasMatch) matchIds.add(aliasMatch.skillId)
      }

      if (matchIds.size > 1) {
        report.conflicted += 1
        report.conflicts.push(
          `Career skill "${career.id}" matches multiple taxonomy skills; resolve manually before syncing.`,
        )
        continue
      }
      if (matchIds.size === 1) {
        const match = skillById.get([...matchIds][0])
        if (!match) continue
        if (match.careerSkillId && match.careerSkillId !== career.id) {
          report.conflicted += 1
          report.conflicts.push(
            `Taxonomy skill "${match.name}" is already linked to career skill "${match.careerSkillId}".`,
          )
          continue
        }
        if (apply) linkCareerSkill(tx, match, career, date)
        report.linked += 1
        continue
      }

      if (apply) createCareerSkill(tx, career, date)
      report.inserted += 1
    }
  }

  if (apply) executor.transaction((tx) => run(tx))
  else run(executor)
  return report
}
