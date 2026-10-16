import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { asc } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../db/client'
import { skillCategories } from '../../db/schema'
import type { DbExecutor } from '../../db/skill-queries'

const keySchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase kebab-case keys.')

const categorySchema = z.object({
  key: keySchema,
  label: z.string().trim().min(1).max(160),
  sortOrder: z.number().int().min(0).max(100_000),
})

const taxonomySchema = z
  .object({
    schemaVersion: z.literal(1),
    categories: z.array(categorySchema).min(1).max(100),
  })
  .superRefine((value, ctx) => {
    const keys = new Set<string>()
    const labels = new Set<string>()
    const sortOrders = new Set<number>()
    for (const [index, category] of value.categories.entries()) {
      if (keys.has(category.key))
        ctx.addIssue({
          code: 'custom',
          message: `Duplicate category key "${category.key}".`,
          path: ['categories', index, 'key'],
        })
      keys.add(category.key)

      const normalizedLabel = category.label.toLocaleLowerCase()
      if (labels.has(normalizedLabel))
        ctx.addIssue({
          code: 'custom',
          message: `Duplicate category label "${category.label}".`,
          path: ['categories', index, 'label'],
        })
      labels.add(normalizedLabel)

      if (sortOrders.has(category.sortOrder))
        ctx.addIssue({
          code: 'custom',
          message: `Duplicate category sortOrder "${category.sortOrder}".`,
          path: ['categories', index, 'sortOrder'],
        })
      sortOrders.add(category.sortOrder)
    }
  })

export type SkillCategoryDefinition = z.infer<typeof categorySchema>
export type SkillTaxonomy = z.infer<typeof taxonomySchema>
export type SkillCategory = string

/**
 * Import-only file resolution for `skill-taxonomy.json`. The importer reads the
 * file on purpose during an upload; the runtime
 * reads `skill_categories` from the database instead.
 */
function taxonomyPath() {
  const configuredDirectory = process.env.CAREER_DATA_DIR?.trim()
  if (configuredDirectory) {
    const configuredDirectories = [
      resolve(process.cwd(), configuredDirectory),
      resolve(process.cwd(), '..', configuredDirectory),
    ]
    const existingDirectory = configuredDirectories.find(existsSync)
    if (existingDirectory) {
      const configuredPath = resolve(existingDirectory, 'skill-taxonomy.json')
      if (existsSync(configuredPath)) return configuredPath
      throw new Error(
        `Skill taxonomy was not found in CAREER_DATA_DIR "${configuredDirectory}". Add skill-taxonomy.json to that directory.`,
      )
    }
  }

  const candidates = [
    resolve(process.cwd(), 'career-data', 'skill-taxonomy.json'),
    resolve(process.cwd(), '..', 'career-data', 'skill-taxonomy.json'),
    resolve(process.cwd(), 'career-data.example', 'skill-taxonomy.json'),
    resolve(process.cwd(), '..', 'career-data.example', 'skill-taxonomy.json'),
  ]
  const path = candidates.find(existsSync)
  if (!path)
    throw new Error(
      'Skill taxonomy was not found. Add skill-taxonomy.json to the career-data directory or set CAREER_DATA_DIR.',
    )
  return path
}

export function parseSkillTaxonomy(json: unknown): SkillTaxonomy {
  return taxonomySchema.parse(json)
}

/** Import-only taxonomy file reader, used by the importer and sync CLIs. */
export function loadSkillTaxonomy(): SkillTaxonomy {
  return parseSkillTaxonomy(JSON.parse(readFileSync(taxonomyPath(), 'utf8')))
}

/**
 * The database-owned category vocabulary. `skill_categories` is authoritative at
 * runtime; the JSON taxonomy is only an import source. An empty database yields
 * an empty vocabulary (onboarding), never an error.
 */
export function skillCategoryDefinitions(executor: DbExecutor = db): SkillCategoryDefinition[] {
  return executor
    .select({
      key: skillCategories.key,
      label: skillCategories.label,
      sortOrder: skillCategories.sortOrder,
    })
    .from(skillCategories)
    .orderBy(asc(skillCategories.sortOrder), asc(skillCategories.key))
    .all()
}

export function skillCategoryKeys(executor: DbExecutor = db): string[] {
  return skillCategoryDefinitions(executor).map((category) => category.key)
}

export function hasSkillCategory(category: string, executor: DbExecutor = db): boolean {
  return skillCategoryKeys(executor).includes(category)
}

export function skillCategoryLabel(
  category: string,
  executor: DbExecutor = db,
): string | undefined {
  return skillCategoryDefinitions(executor).find((item) => item.key === category)?.label
}

export function skillCategorySortOrder(
  category: string,
  executor: DbExecutor = db,
): number | undefined {
  return skillCategoryDefinitions(executor).find((item) => item.key === category)?.sortOrder
}
