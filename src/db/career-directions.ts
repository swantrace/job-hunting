import { asc, eq } from 'drizzle-orm'
import {
  type GenerationRules,
  generationRulesSchema,
  parseJsonColumn,
  serializeJsonColumn,
  targetTitlesSchema,
} from '../lib/career/json-schemas'
import { nowISO } from '../lib/date'
import {
  assertExpectedRevision,
  type CareerDb,
  CareerReferenceError,
  type CareerSaveResult,
  recordCareerChange,
  stableFingerprint,
} from './career-state'
import { db } from './client'
import { type CareerDirection, careerDirections } from './schema'
import type { DbExecutor } from './skill-queries'

/**
 * Directions: the stable identity a candidate targets, with target titles and
 * bounded generation rules. Direction keys are external identities referenced
 * by Base Resumes and record junctions, so they are never renamed. A direction
 * that already has dependants (Base Resume versions) can be retired but is
 * never deleted; there is deliberately no delete path.
 */

export type CareerDirectionListOptions = { includeRetired?: boolean }

export type CareerDirectionRecord = Omit<CareerDirection, 'targetTitlesJson' | 'rulesJson'> & {
  targetTitles: string[]
  rules: GenerationRules | null
}

export type CareerDirectionInput = {
  key: string
  label: string
  targetTitles: string[]
  rules?: GenerationRules | null
  sortOrder?: number
}

export type CareerDirectionUpdateInput = {
  label?: string
  targetTitles?: string[]
  rules?: GenerationRules | null
  sortOrder?: number
}

function directionToRecord(row: CareerDirection): CareerDirectionRecord {
  return {
    ...row,
    targetTitles: parseJsonColumn(
      row.targetTitlesJson,
      targetTitlesSchema,
      [],
      'career_directions.target_titles_json',
    ),
    rules: parseJsonColumn(
      row.rulesJson,
      generationRulesSchema,
      null,
      'career_directions.rules_json',
    ),
  }
}

function requireDirection(tx: CareerDb, key: string): CareerDirection {
  const row = tx.select().from(careerDirections).where(eq(careerDirections.key, key)).get()
  if (!row) throw new CareerReferenceError(`Direction "${key}" does not exist.`)
  return row
}

function validateDirection(
  label: string,
  targetTitles: string[],
  rules: GenerationRules | null,
): { label: string; targetTitles: string[]; rules: GenerationRules | null } {
  if (label.trim() === '') throw new CareerReferenceError('Direction label is required.')
  return {
    label: label.trim(),
    targetTitles: targetTitlesSchema.parse(targetTitles),
    rules: rules === null ? null : generationRulesSchema.parse(rules),
  }
}

export function listCareerDirections(
  executor: DbExecutor = db,
  options: CareerDirectionListOptions = {},
): CareerDirectionRecord[] {
  return executor
    .select()
    .from(careerDirections)
    .orderBy(asc(careerDirections.sortOrder), asc(careerDirections.key))
    .all()
    .filter((row) => options.includeRetired || row.retiredAt === null)
    .map(directionToRecord)
}

export function readCareerDirection(
  executor: DbExecutor,
  key: string,
): CareerDirectionRecord | null {
  const row = executor.select().from(careerDirections).where(eq(careerDirections.key, key)).get()
  return row ? directionToRecord(row) : null
}

export function createCareerDirection(
  executor: CareerDb,
  input: CareerDirectionInput,
): CareerSaveResult {
  return executor.transaction((tx) => {
    const key = input.key.trim()
    if (key === '') throw new CareerReferenceError('Direction key is required.')
    const existing = tx.select().from(careerDirections).where(eq(careerDirections.key, key)).get()
    if (existing) throw new CareerReferenceError(`Direction "${key}" already exists.`)
    const validated = validateDirection(input.label, input.targetTitles, input.rules ?? null)
    const sortOrder = input.sortOrder ?? 0
    const now = nowISO()
    tx.insert(careerDirections)
      .values({
        key,
        label: validated.label,
        targetTitlesJson: serializeJsonColumn(validated.targetTitles),
        rulesJson: validated.rules === null ? null : serializeJsonColumn(validated.rules),
        sortOrder,
        createdAt: now,
        updatedAt: now,
      })
      .run()
    recordCareerChange(tx, stableFingerprint({ key, ...validated, sortOrder }))
    return { changed: true, revision: 1 }
  })
}

export function updateCareerDirection(
  executor: CareerDb,
  key: string,
  input: CareerDirectionUpdateInput,
  options: { expectedRevision?: number } = {},
): CareerSaveResult {
  return executor.transaction((tx) => {
    const existing = requireDirection(tx, key)
    assertExpectedRevision('Direction', key, options.expectedRevision, existing.revision)
    const current = directionToRecord(existing)
    const next = {
      label: input.label ?? current.label,
      targetTitles: input.targetTitles ?? current.targetTitles,
      rules: input.rules === undefined ? current.rules : input.rules,
      sortOrder: input.sortOrder ?? existing.sortOrder,
    }
    const validated = validateDirection(next.label, next.targetTitles, next.rules)
    const content = { key, ...validated, sortOrder: next.sortOrder }
    if (
      stableFingerprint(content) ===
      stableFingerprint({
        key,
        label: current.label,
        targetTitles: current.targetTitles,
        rules: current.rules,
        sortOrder: existing.sortOrder,
      })
    ) {
      return { changed: false, revision: existing.revision }
    }
    const revision = existing.revision + 1
    tx.update(careerDirections)
      .set({
        label: validated.label,
        targetTitlesJson: serializeJsonColumn(validated.targetTitles),
        rulesJson: validated.rules === null ? null : serializeJsonColumn(validated.rules),
        sortOrder: next.sortOrder,
        revision,
        updatedAt: nowISO(),
      })
      .where(eq(careerDirections.key, key))
      .run()
    recordCareerChange(tx, stableFingerprint(content))
    return { changed: true, revision }
  })
}

export function retireCareerDirection(executor: CareerDb, key: string): CareerSaveResult {
  return executor.transaction((tx) => {
    const existing = requireDirection(tx, key)
    if (existing.retiredAt !== null) return { changed: false, revision: existing.revision }
    const revision = existing.revision + 1
    tx.update(careerDirections)
      .set({ retiredAt: nowISO(), revision, updatedAt: nowISO() })
      .where(eq(careerDirections.key, key))
      .run()
    recordCareerChange(tx, stableFingerprint({ key, retired: true }))
    return { changed: true, revision }
  })
}

/** Undoes a retirement so a direction can be targeted again; history is intact. */
export function restoreCareerDirection(executor: CareerDb, key: string): CareerSaveResult {
  return executor.transaction((tx) => {
    const existing = requireDirection(tx, key)
    if (existing.retiredAt === null) return { changed: false, revision: existing.revision }
    const revision = existing.revision + 1
    tx.update(careerDirections)
      .set({ retiredAt: null, revision, updatedAt: nowISO() })
      .where(eq(careerDirections.key, key))
      .run()
    recordCareerChange(tx, stableFingerprint({ key, retired: false }))
    return { changed: true, revision }
  })
}
