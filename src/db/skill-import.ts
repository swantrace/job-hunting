import { eq } from 'drizzle-orm'
import { nowISO } from '../lib/date'
import { type ImportPayload, skillKey, textValue } from '../lib/job-intake/import'
import { skillOrigins, skillReviewStatuses } from '../lib/skills/constants'
import { isMeaningfulSkillTerm, normalizeSkillAlias } from '../lib/skills/normalize'
import { hasSkillCategory } from '../lib/skills/taxonomy'
import { skillAliases, skills } from './schema'
import { deleteCatalogSkill } from './skill-deletion'
import { insertSkill } from './skill-queries'
import {
  addSkillAlias,
  assertSkillLabelAvailable,
  mergeSkills,
  replaceSkillAliases,
  type SkillDb,
} from './skill-service'

/** Shared by the rolled-back preview and the confirmed import transaction. */
export function applySkillImport(payload: ImportPayload, tx: SkillDb) {
  const ids = new Map<number, number>()
  const seen = new Set<string>()
  const notices: string[] = []
  const find = (key: string) => tx.select().from(skills).where(eq(skills.key, key)).get()
  const legacy =
    payload.schemaVersion < 6 ? payload.skills.filter((row) => row.reviewStatus === 'merged') : []
  const rows = payload.skills.filter((row) => !legacy.includes(row))
  for (const incoming of rows) {
    const key = skillKey(incoming)
    const name = textValue(incoming.name)
    if (
      !key ||
      key.length > 120 ||
      !isMeaningfulSkillTerm(key) ||
      !isMeaningfulSkillTerm(name) ||
      name.length > 120
    )
      throw new Error(
        'Every skill requires a meaningful name and stable key of at most 120 characters.',
      )
    if (seen.has(key)) throw new Error(`Duplicate skill key "${key}".`)
    seen.add(key)
    const existing = find(key)
    if (existing?.reviewStatus === 'merged')
      throw new Error(`"${key}" is a legacy merged skill. Edit its target instead.`)
    if (
      incoming.category != null &&
      (typeof incoming.category !== 'string' || !hasSkillCategory(incoming.category, tx))
    )
      throw new Error(`Unknown category for "${key}".`)
    if (
      incoming.reviewStatus !== undefined &&
      (!skillReviewStatuses.includes(incoming.reviewStatus as never) ||
        incoming.reviewStatus === 'merged')
    )
      throw new Error(`Invalid review status for "${key}". Use mergeSkills to merge records.`)
    if (incoming.origin !== undefined && !skillOrigins.includes(incoming.origin as never))
      throw new Error(`Invalid origin for "${key}".`)
    if (existing?.origin === 'career-data') {
      notices.push(
        `"${key}": career-data name, category, review status and origin are protected; aliases can still be edited.`,
      )
    } else if (existing) {
      if (name !== existing.name) assertSkillLabelAvailable(tx, name, [existing.id])
      tx.update(skills)
        .set({
          name,
          category:
            incoming.category === undefined
              ? existing.category
              : (incoming.category as typeof existing.category),
          reviewStatus:
            incoming.reviewStatus === undefined
              ? existing.reviewStatus
              : (incoming.reviewStatus as typeof existing.reviewStatus),
          updatedAt: nowISO(),
        })
        .where(eq(skills.id, existing.id))
        .run()
    } else {
      assertSkillLabelAvailable(tx, key, [])
      assertSkillLabelAvailable(tx, name, [])
    }
    const row =
      existing ??
      insertSkill(tx, {
        key,
        name,
        category: incoming.category as typeof skills.$inferSelect.category | undefined,
        reviewStatus: incoming.reviewStatus as typeof skills.$inferSelect.reviewStatus | undefined,
        origin: (incoming.origin ?? 'import') as typeof skills.$inferSelect.origin,
      })
    if (typeof incoming.id === 'number') ids.set(incoming.id, row.id)
  }
  // Remove explicitly replaced alias sets first, so aliases can move between
  // records in one atomic import without order-dependent collisions.
  for (const incoming of rows) {
    if (incoming.aliases === undefined) continue
    if (
      !Array.isArray(incoming.aliases) ||
      incoming.aliases.some((alias) => typeof alias !== 'string')
    )
      throw new Error(`Aliases for "${skillKey(incoming)}" must be a string array.`)
    const row = find(skillKey(incoming))!
    tx.delete(skillAliases).where(eq(skillAliases.skillId, row.id)).run()
  }
  for (const incoming of rows) {
    if (incoming.aliases !== undefined)
      replaceSkillAliases(find(skillKey(incoming))!.id, incoming.aliases as string[], tx)
  }
  // Old backups contain redirect rows. Resolve their final target without
  // recreating soft merges, including when importing into an empty database.
  for (const incoming of legacy) {
    let targetRow = incoming
    const visited = new Set<Record<string, unknown>>()
    while (targetRow.reviewStatus === 'merged') {
      if (visited.has(targetRow)) throw new Error('Circular merge in legacy import.')
      visited.add(targetRow)
      const next = payload.skills.find((row) => row.id === targetRow.mergedIntoSkillId)
      if (!next) throw new Error('Legacy merge target is missing from the import.')
      targetRow = next
    }
    const target = find(skillKey(targetRow))
    if (!target) throw new Error('Legacy merge target does not exist.')
    const source = find(skillKey(incoming))
    if (source) mergeSkills(source.id, target.id, tx, 'target')
    else
      for (const label of [incoming.name, skillKey(incoming)])
        addSkillAlias(target.id, textValue(label), 'manual', tx)
    if (typeof incoming.id === 'number') ids.set(incoming.id, target.id)
    notices.push(
      `Legacy merged skill "${skillKey(incoming)}" resolves to "${target.key}"; no redirect row is imported.`,
    )
  }
  for (const incoming of payload.skillAliases) {
    const id = ids.get(Number(incoming.skillId))
    if (!id) throw new Error('A legacy alias references a skill missing from the import.')
    const embedded = payload.skills.find((skill) => skill.id === incoming.skillId)?.aliases
    if (embedded !== undefined) continue
    addSkillAlias(id, textValue(incoming.alias), 'manual', tx)
  }
  const operated = new Set<string>()
  for (const operation of payload.mergeSkills) {
    if (operated.has(operation.sourceKey) || seen.has(operation.sourceKey))
      throw new Error(
        `"${operation.sourceKey}" cannot be updated and merged, or merged twice, in one import.`,
      )
    operated.add(operation.sourceKey)
    const source = find(operation.sourceKey)
    const target = find(operation.targetKey)
    if (!source || !target) throw new Error('Merge source and target keys must exist.')
    mergeSkills(source.id, target.id, tx, operation.personalResolution)
  }
  for (const key of payload.deleteSkills) {
    if (seen.has(key) || operated.has(key)) throw new Error(`Conflicting operations for "${key}".`)
    operated.add(key)
    const row = find(key)
    if (!row) throw new Error(`Cannot delete unknown skill "${key}".`)
    try {
      deleteCatalogSkill(row.id, tx)
    } catch {
      throw new Error(
        `Cannot delete "${key}": it is referenced by personal career data or legacy merge redirects. Merge it instead.`,
      )
    }
  }
  return { ids, notices }
}

export function skillImportState(tx: SkillDb) {
  const aliases = tx.select().from(skillAliases).all()
  return tx
    .select()
    .from(skills)
    .all()
    .map((row) => ({
      ...row,
      aliases: aliases
        .filter((alias) => alias.skillId === row.id)
        .map((alias) => alias.alias)
        .sort((a, b) => normalizeSkillAlias(a).localeCompare(normalizeSkillAlias(b))),
    }))
}

/** Read-only portable projection; old redirects become aliases of the final target. */
export function exportSkillCatalog(tx: SkillDb) {
  const rows = skillImportState(tx)
  const byId = new Map(rows.map((row) => [row.id, row]))
  for (const source of rows.filter((row) => row.reviewStatus === 'merged')) {
    let target = source
    const seen = new Set<number>()
    while (target.reviewStatus === 'merged') {
      if (seen.has(target.id)) throw new Error('Circular legacy skill merge prevents export.')
      seen.add(target.id)
      const next = byId.get(target.mergedIntoSkillId!)
      if (!next) throw new Error('A legacy skill merge target is missing.')
      target = next
    }
    const aliases = new Map(target.aliases.map((alias) => [normalizeSkillAlias(alias), alias]))
    for (const alias of [source.name, source.key, ...source.aliases])
      if (!aliases.has(normalizeSkillAlias(alias))) aliases.set(normalizeSkillAlias(alias), alias)
    target.aliases = [...aliases.values()]
  }
  return rows.filter((row) => row.reviewStatus !== 'merged')
}
