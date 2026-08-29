import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'

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

function taxonomyPath() {
  const configured = process.env.SKILL_TAXONOMY_FILE?.trim()
  const candidates = [
    configured,
    resolve(process.cwd(), 'config', 'skill-taxonomy.json'),
    resolve(process.cwd(), '..', 'config', 'skill-taxonomy.json'),
  ]
  const path = candidates
    .filter((candidate): candidate is string => Boolean(candidate))
    .find(existsSync)
  if (!path) throw new Error('Skill taxonomy configuration was not found.')
  return path
}

export function loadSkillTaxonomy(): SkillTaxonomy {
  return taxonomySchema.parse(JSON.parse(readFileSync(taxonomyPath(), 'utf8')))
}

export function skillCategoryDefinitions(): SkillCategoryDefinition[] {
  return [...loadSkillTaxonomy().categories].sort((left, right) => left.sortOrder - right.sortOrder)
}

export function skillCategoryKeys(): string[] {
  return skillCategoryDefinitions().map((category) => category.key)
}

export function hasSkillCategory(category: string): boolean {
  return skillCategoryKeys().includes(category)
}

export function skillCategoryLabel(category: string): string | undefined {
  return skillCategoryDefinitions().find((item) => item.key === category)?.label
}

export function skillCategorySortOrder(category: string): number | undefined {
  return skillCategoryDefinitions().find((item) => item.key === category)?.sortOrder
}
