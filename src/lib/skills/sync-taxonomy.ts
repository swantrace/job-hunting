import { eq } from 'drizzle-orm'
import { skillCategories } from '../../db/schema'
import type { DbExecutor } from '../../db/skill-queries'
import type { SkillDb } from '../../db/skill-service'
import { todayISO } from '../date'
import type { SkillCategoryDefinition } from './taxonomy'

export type TaxonomySyncReport = {
  inserted: number
  updated: number
  unchanged: number
  orphaned: string[]
}

/**
 * Synchronizes the checked-in taxonomy configuration to SQLite. The JSON file
 * owns category key, label, and order; database-only rows are retained so
 * historical skill records are never invalidated by a configuration change.
 */
export function syncSkillTaxonomy(
  executor: SkillDb,
  categories: SkillCategoryDefinition[],
  options: { apply?: boolean } = {},
): TaxonomySyncReport {
  const apply = options.apply ?? false
  const date = todayISO()
  const report: TaxonomySyncReport = { inserted: 0, updated: 0, unchanged: 0, orphaned: [] }

  const run = (tx: DbExecutor) => {
    const existing = tx.select().from(skillCategories).all()
    const byKey = new Map(existing.map((category) => [category.key, category]))
    const configuredKeys = new Set(categories.map((category) => category.key))

    for (const category of categories) {
      const current = byKey.get(category.key)
      if (!current) {
        if (apply)
          tx.insert(skillCategories)
            .values({
              key: category.key,
              label: category.label,
              sortOrder: category.sortOrder,
              createdAt: date,
              updatedAt: date,
            })
            .run()
        report.inserted += 1
        continue
      }
      if (current.label !== category.label || current.sortOrder !== category.sortOrder) {
        if (apply)
          tx.update(skillCategories)
            .set({ label: category.label, sortOrder: category.sortOrder, updatedAt: date })
            .where(eq(skillCategories.id, current.id))
            .run()
        report.updated += 1
      } else {
        report.unchanged += 1
      }
    }

    report.orphaned = existing
      .filter((category) => !configuredKeys.has(category.key))
      .map((category) => category.key)
      .sort()
  }

  if (apply) executor.transaction((tx) => run(tx))
  else run(executor)
  return report
}
