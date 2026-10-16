import { createHash } from 'node:crypto'
import type { AnySQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core'
import { nowISO } from '../lib/date'
import { db } from './client'
import {
  careerAchievementPublications,
  careerAchievementSkills,
  careerAchievements,
  careerBaseResumes,
  careerDirections,
  careerEducation,
  careerExperiences,
  careerProfile,
  careerProjectSkills,
  careerProjects,
  careerPublicationProjects,
  careerPublications,
  careerRecordDirections,
  careerSkills,
  careerStories,
  skillAliases,
  skillCategories,
  skills,
} from './schema'
import type { DbExecutor } from './skill-queries'

/**
 * Shared career write primitives. Successor of the deleted `career-state`
 * module: migration 0029 dissolved `career_state`, so the aggregate revision
 * counter and the verbatim document archive are gone. What remains is the
 * per-row optimistic locking (each table still owns its own `revision`), the
 * content fingerprint used for no-op detection, and the change probe below,
 * which is computed from the data instead of stored.
 */

/** Executor with transactions, for writes spanning several statements. */
export type CareerDb = Pick<typeof db, 'select' | 'insert' | 'delete' | 'update' | 'transaction'>

/** Result of a write addressed by internal id (records, skills). */
export type CareerWriteResult = { id: number; changed: boolean; revision: number }

/** Result of a singleton or key-addressed write (candidate, preferences, directions). */
export type CareerSaveResult = { changed: boolean; revision: number }

/** A stale form submitted a revision that is no longer current. */
export class CareerRevisionConflictError extends Error {
  constructor(
    entity: string,
    id: number | string,
    readonly expected: number,
    readonly actual: number,
  ) {
    super(
      `${entity} ${id} changed since it was loaded: expected revision ${expected}, found ${actual}.`,
    )
  }
}

/** A write referenced an unknown, retired or otherwise unusable record. */
export class CareerReferenceError extends Error {}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/**
 * Deterministic fingerprint of a logical entity content object. Key order and
 * `undefined` placeholders do not change the fingerprint, so re-saving
 * identical content is a no-op regardless of how the caller built the object.
 */
export function stableFingerprint(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex')
}

/** Throws when a submitted form revision is not the current record revision. */
export function assertExpectedRevision(
  entity: string,
  id: number | string,
  expected: number | undefined,
  actual: number,
): void {
  if (expected !== undefined && expected !== actual) {
    throw new CareerRevisionConflictError(entity, id, expected, actual)
  }
}

// ---------------------------------------------------------------------------
// Computed change probe
// ---------------------------------------------------------------------------

type ProbeTable = { name: string; table: SQLiteTable; updatedAt: AnySQLiteColumn | null }

/**
 * Every table that feeds the canonical career shape. Hash actual contents,
 * including junctions: counts and maximum timestamps miss same-size edits.
 */
const probeTables: ProbeTable[] = [
  { name: 'career_profile', table: careerProfile, updatedAt: careerProfile.updatedAt },
  { name: 'career_education', table: careerEducation, updatedAt: careerEducation.updatedAt },
  { name: 'career_experiences', table: careerExperiences, updatedAt: careerExperiences.updatedAt },
  {
    name: 'career_achievements',
    table: careerAchievements,
    updatedAt: careerAchievements.updatedAt,
  },
  { name: 'career_projects', table: careerProjects, updatedAt: careerProjects.updatedAt },
  { name: 'career_stories', table: careerStories, updatedAt: careerStories.updatedAt },
  {
    name: 'career_publications',
    table: careerPublications,
    updatedAt: careerPublications.updatedAt,
  },
  { name: 'career_skills', table: careerSkills, updatedAt: careerSkills.updatedAt },
  { name: 'career_directions', table: careerDirections, updatedAt: careerDirections.updatedAt },
  { name: 'career_base_resumes', table: careerBaseResumes, updatedAt: careerBaseResumes.updatedAt },
  { name: 'skill_categories', table: skillCategories, updatedAt: skillCategories.updatedAt },
  { name: 'skills', table: skills, updatedAt: skills.updatedAt },
  { name: 'career_record_directions', table: careerRecordDirections, updatedAt: null },
  { name: 'career_achievement_skills', table: careerAchievementSkills, updatedAt: null },
  { name: 'career_project_skills', table: careerProjectSkills, updatedAt: null },
  {
    name: 'career_achievement_publications',
    table: careerAchievementPublications,
    updatedAt: null,
  },
  { name: 'career_publication_projects', table: careerPublicationProjects, updatedAt: null },
  { name: 'skill_aliases', table: skillAliases, updatedAt: null },
]

function probeEntry(executor: DbExecutor, table: SQLiteTable, updatedAt: AnySQLiteColumn | null) {
  const rows = executor.select().from(table).all()
  const newest = updatedAt
    ? (rows
        .map((row) => row.updatedAt)
        .filter((value): value is string => typeof value === 'string')
        .sort()
        .at(-1) ?? null)
    : null
  return { content: rows.map(stableFingerprint).sort(), newest }
}

export type CareerContentProbeState = {
  /** Stable fingerprint of complete career and catalog contents. */
  fingerprint: string
  /** Newest career timestamp, or `nowISO()` when no career row exists yet. */
  updatedAt: string
}

/**
 * Content-based correctness deliberately takes priority over an aggregate
 * shortcut. The assembler remains memoized; same-size link and alias edits
 * invalidate it even when updated_at has not changed.
 */
export function readCareerContentProbe(executor: DbExecutor = db): CareerContentProbeState {
  const entries = probeTables.map(({ name, table, updatedAt }) => {
    const { content, newest } = probeEntry(executor, table, updatedAt)
    return { table: name, content, newest }
  })
  const timestamps = entries
    .map((entry) => entry.newest)
    .filter((value): value is string => typeof value === 'string' && value !== '')
    .sort()
  return {
    fingerprint: stableFingerprint(entries),
    updatedAt: timestamps[timestamps.length - 1] ?? nowISO(),
  }
}

/**
 * The stored `career_state.revision`/`content_hash` replacement: a value
 * computed from the data, so nothing has to be kept in sync by every write.
 */
export function careerContentProbe(executor: DbExecutor = db): string {
  return readCareerContentProbe(executor).fingerprint
}
