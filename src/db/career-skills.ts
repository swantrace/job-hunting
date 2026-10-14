import { asc, eq } from 'drizzle-orm'
import { parseJsonColumn, serializeJsonColumn, stringListSchema } from '../lib/career/json-schemas'
import { nowISO } from '../lib/date'
import {
  assertExpectedRevision,
  type CareerDb,
  CareerReferenceError,
  type CareerWriteResult,
  recordCareerChange,
  stableFingerprint,
} from './career-state'
import { db } from './client'
import { careerSkills, skills } from './schema'
import type { DbExecutor } from './skill-queries'

/**
 * Personal skills. A personal skill always points at an existing, approved
 * catalog entry and never creates one: mapping a term to a standard skill does
 * not invent a catalog record, and this module must never create an alias
 * either. `removeCareerSkill` intentionally does not exist — retirement is the
 * only removal path, so a skill's history is preserved.
 */

export type CareerSkillListOptions = { includeRetired?: boolean }

export type CareerSkillRecord = {
  id: number
  skillId: number
  skillKey: string
  skillName: string
  category: string | null
  level: string | null
  resumeEligible: boolean
  explanation: string | null
  notes: string | null
  evidence: string[]
  retiredAt: string | null
  revision: number
  createdAt: string
  updatedAt: string
}

export type CareerSkillInput = {
  /** Display key of an existing approved catalog skill. */
  skillKey?: string
  /** Internal id of an existing approved catalog skill. */
  skillId?: number
  level?: string | null
  resumeEligible?: boolean
  explanation?: string | null
  notes?: string | null
  evidence?: string[]
}

export type CareerSkillUpdateInput = Omit<CareerSkillInput, 'skillKey' | 'skillId'>

function careerSkillContent(source: CareerSkillInput) {
  return {
    level: source.level ?? null,
    resumeEligible: source.resumeEligible ?? true,
    explanation: source.explanation ?? null,
    notes: source.notes ?? null,
    evidence: source.evidence ?? [],
  }
}

function careerSkillColumns(content: ReturnType<typeof careerSkillContent>) {
  return {
    level: content.level,
    resumeEligible: content.resumeEligible,
    explanation: content.explanation,
    notes: content.notes,
    evidenceJson: serializeJsonColumn(stringListSchema.parse(content.evidence)),
  }
}

export function listCareerSkills(
  executor: DbExecutor = db,
  options: CareerSkillListOptions = {},
): CareerSkillRecord[] {
  return executor
    .select({
      row: careerSkills,
      skillKey: skills.key,
      skillName: skills.name,
      category: skills.category,
    })
    .from(careerSkills)
    .innerJoin(skills, eq(careerSkills.skillId, skills.id))
    .orderBy(asc(careerSkills.id))
    .all()
    .filter((row) => options.includeRetired || row.row.retiredAt === null)
    .map((row) => ({
      id: row.row.id,
      skillId: row.row.skillId,
      skillKey: row.skillKey,
      skillName: row.skillName,
      category: row.category,
      level: row.row.level,
      resumeEligible: row.row.resumeEligible,
      explanation: row.row.explanation,
      notes: row.row.notes,
      evidence: parseJsonColumn(
        row.row.evidenceJson,
        stringListSchema,
        [],
        'career_skills.evidence_json',
      ),
      retiredAt: row.row.retiredAt,
      revision: row.row.revision,
      createdAt: row.row.createdAt,
      updatedAt: row.row.updatedAt,
    }))
}

function requireCatalogSkill(tx: CareerDb, input: CareerSkillInput) {
  const skill =
    input.skillId !== undefined
      ? (tx.select().from(skills).where(eq(skills.id, input.skillId)).get() ?? null)
      : input.skillKey !== undefined
        ? (tx.select().from(skills).where(eq(skills.key, input.skillKey)).get() ?? null)
        : null
  if (!skill) {
    const label = input.skillKey ?? input.skillId
    throw new CareerReferenceError(
      `Catalog skill "${label}" does not exist. Create the approved catalog entry first; a personal skill never creates one.`,
    )
  }
  if (skill.reviewStatus === 'merged') {
    throw new CareerReferenceError(`Catalog skill "${skill.key}" is merged and cannot be used.`)
  }
  if (skill.reviewStatus !== 'approved') {
    throw new CareerReferenceError(
      `Catalog skill "${skill.key}" is ${skill.reviewStatus}, not approved. A personal skill requires an approved catalog entry.`,
    )
  }
  return skill
}

function requireCareerSkill(tx: CareerDb, id: number) {
  const row = tx.select().from(careerSkills).where(eq(careerSkills.id, id)).get()
  if (!row) throw new CareerReferenceError(`Personal skill ${id} does not exist.`)
  return row
}

export function createCareerSkill(executor: CareerDb, input: CareerSkillInput): CareerWriteResult {
  return executor.transaction((tx) => {
    const skill = requireCatalogSkill(tx, input)
    const existing = tx.select().from(careerSkills).where(eq(careerSkills.skillId, skill.id)).get()
    if (existing) {
      throw new CareerReferenceError(
        `A personal skill for catalog skill "${skill.key}" already exists (id ${existing.id}).`,
      )
    }
    const content = careerSkillContent(input)
    const now = nowISO()
    const inserted = tx
      .insert(careerSkills)
      .values({ skillId: skill.id, ...careerSkillColumns(content), createdAt: now, updatedAt: now })
      .returning({ id: careerSkills.id })
      .get()
    recordCareerChange(tx, stableFingerprint({ skillId: skill.id, ...content }))
    return { id: inserted.id, changed: true, revision: 1 }
  })
}

export function updateCareerSkill(
  executor: CareerDb,
  id: number,
  input: CareerSkillUpdateInput,
  options: { expectedRevision?: number } = {},
): CareerWriteResult {
  return executor.transaction((tx) => {
    const existing = requireCareerSkill(tx, id)
    assertExpectedRevision('Personal skill', id, options.expectedRevision, existing.revision)
    const current = {
      level: existing.level,
      resumeEligible: existing.resumeEligible,
      explanation: existing.explanation,
      notes: existing.notes,
      evidence: parseJsonColumn(
        existing.evidenceJson,
        stringListSchema,
        [],
        'career_skills.evidence_json',
      ),
    }
    const content = careerSkillContent({ ...input, skillId: existing.skillId })
    if (stableFingerprint(current) === stableFingerprint(content)) {
      return { id, changed: false, revision: existing.revision }
    }
    const revision = existing.revision + 1
    tx.update(careerSkills)
      .set({ ...careerSkillColumns(content), revision, updatedAt: nowISO() })
      .where(eq(careerSkills.id, id))
      .run()
    recordCareerChange(tx, stableFingerprint({ skillId: existing.skillId, ...content }))
    return { id, changed: true, revision }
  })
}

export function retireCareerSkill(executor: CareerDb, id: number): CareerWriteResult {
  return executor.transaction((tx) => {
    const existing = requireCareerSkill(tx, id)
    if (existing.retiredAt !== null) return { id, changed: false, revision: existing.revision }
    const revision = existing.revision + 1
    tx.update(careerSkills)
      .set({ retiredAt: nowISO(), revision, updatedAt: nowISO() })
      .where(eq(careerSkills.id, id))
      .run()
    recordCareerChange(tx, stableFingerprint({ careerSkillId: id, retired: true }))
    return { id, changed: true, revision }
  })
}
