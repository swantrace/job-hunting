import { createHash } from 'node:crypto'
import { sql } from 'drizzle-orm'
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
 * Every table that feeds the canonical career shape. Tables with an
 * `updated_at` column contribute their row count and their newest timestamp;
 * junction tables (which have no timestamp) contribute their row count. So the
 * probe changes for any career fact, catalog row, category or link write —
 * including catalog renames and merges, which previously left the assembler
 * cache stale because they had no counter of their own.
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
  if (updatedAt) {
    const row = executor
      .select({ count: sql<number>`count(*)`, newest: sql<string | null>`max(${updatedAt})` })
      .from(table)
      .get()
    return { count: row?.count ?? 0, newest: row?.newest ?? null }
  }
  const row = executor.select({ count: sql<number>`count(*)` }).from(table).get()
  return { count: row?.count ?? 0, newest: null }
}

export type CareerContentProbeState = {
  /** Stable fingerprint of every career row count and newest timestamp. */
  fingerprint: string
  /** Newest career timestamp, or `nowISO()` when no career row exists yet. */
  updatedAt: string
}

/**
 * Reads the change probe: a fingerprint over every career-feeding table's row
 * count (and newest `updated_at` where the table has one). It is cheap — one
 * tiny aggregate query per table — and is the single freshness identity that
 * replaced `career_state.revision` + `career_state.content_hash`.
 */
export function readCareerContentProbe(executor: DbExecutor = db): CareerContentProbeState {
  const entries = probeTables.map(({ name, table, updatedAt }) => {
    const { count, newest } = probeEntry(executor, table, updatedAt)
    return { table: name, count, newest }
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
