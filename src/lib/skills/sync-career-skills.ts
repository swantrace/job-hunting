import { eq } from 'drizzle-orm'
import { skillAliases, skills } from '../../db/schema'
import type { DbExecutor } from '../../db/skill-queries'
import type { SkillDb } from '../../db/skill-service'
import { todayISO } from '../date'
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
  updated: number
  unchanged: number
  conflicted: number
  conflicts: string[]
}

function emptyReport(): SyncReport {
  return { inserted: 0, updated: 0, unchanged: 0, conflicted: 0, conflicts: [] }
}

function syncAliases(
  tx: DbExecutor,
  skillId: number,
  aliases: string[],
  date: string,
  report: SyncReport,
) {
  for (const alias of aliases) {
    const normalizedAlias = normalizeSkillAlias(alias)
    const existing = tx
      .select()
      .from(skillAliases)
      .where(eq(skillAliases.normalizedAlias, normalizedAlias))
      .get()
    if (existing?.skillId === skillId) continue
    if (existing) {
      report.conflicted += 1
      report.conflicts.push(
        `Alias "${alias}" is already assigned to another skill; merge the skills manually if they are equivalent.`,
      )
      continue
    }
    tx.insert(skillAliases)
      .values({
        skillId,
        alias,
        normalizedAlias,
        origin: 'career-data',
        createdAt: date,
      })
      .run()
  }
}

/**
 * Synchronizes career-data skills into the operational taxonomy. The sync is
 * one-way and idempotent. Identity is matched by immutable key only; names and
 * aliases are never used to guess equivalence. Skills absent from career data
 * are retained so the taxonomy can grow while applications are reviewed.
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
    const byKey = new Map(
      tx
        .select()
        .from(skills)
        .all()
        .filter((skill) => skill.reviewStatus !== 'merged')
        .map((skill) => [skill.key, skill]),
    )

    for (const career of data.skills.skills) {
      const existing = byKey.get(career.id)
      if (!existing) {
        report.inserted += 1
        if (!apply) continue
        const created = tx
          .insert(skills)
          .values({
            key: career.id,
            name: career.label,
            category: career.category,
            reviewStatus: 'approved',
            origin: 'career-data',
            createdAt: date,
            updatedAt: date,
          })
          .returning()
          .get()
        byKey.set(created.key, created)
        syncAliases(tx, created.id, career.aliases ?? [], date, report)
        continue
      }

      const changed =
        existing.name !== career.label ||
        existing.category !== career.category ||
        existing.reviewStatus !== 'approved' ||
        existing.origin !== 'career-data'
      if (changed) report.updated += 1
      else report.unchanged += 1
      if (!apply) continue
      if (changed)
        tx.update(skills)
          .set({
            name: career.label,
            category: career.category,
            reviewStatus: 'approved',
            origin: 'career-data',
            updatedAt: date,
          })
          .where(eq(skills.id, existing.id))
          .run()
      syncAliases(tx, existing.id, career.aliases ?? [], date, report)
    }
  }

  if (apply) executor.transaction((tx) => run(tx))
  else run(executor)
  return report
}
