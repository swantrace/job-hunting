import { and, eq } from 'drizzle-orm'
import { type CareerDb, stableFingerprint } from '../../db/career-shared'
import {
  careerAchievements,
  careerBaseResumes,
  careerEducation,
  careerExperiences,
  careerProfile,
  careerProjects,
  careerPublications,
  careerSkills,
  careerStories,
  skills,
} from '../../db/schema'
import type { DbExecutor } from '../../db/skill-queries'
import { nowISO } from '../date'
import { parseExtensionLines } from './form-input'
import {
  extensionObjectOrNull,
  extensionSchema,
  parseJsonColumn,
  serializeJsonColumn,
} from './json-schemas'

/**
 * Preserved extension fields for one career record. Migration 0029 dissolved the
 * `career_state` archive: each record kind now owns its unmodelled authored
 * fields in its own `extension_json` column, and `candidate`/`preferences` share
 * the `career_profile` singleton column. These helpers keep the editors'
 * ordinary `key = value` control, so a preserved field is never only raw JSON
 * and an empty edit removes the field instead of leaving residue in the row.
 */

function readExtensionColumn(executor: DbExecutor, kind: string, key: string): string | null {
  switch (kind) {
    case 'candidate':
    case 'preferences':
      return (
        executor
          .select({ value: careerProfile.extensionJson })
          .from(careerProfile)
          .where(eq(careerProfile.id, 1))
          .get()?.value ?? null
      )
    case 'education':
      return (
        executor
          .select({ value: careerEducation.extensionJson })
          .from(careerEducation)
          .where(eq(careerEducation.stableKey, key))
          .get()?.value ?? null
      )
    case 'experiences':
      return (
        executor
          .select({ value: careerExperiences.extensionJson })
          .from(careerExperiences)
          .where(eq(careerExperiences.stableKey, key))
          .get()?.value ?? null
      )
    case 'achievements':
      return (
        executor
          .select({ value: careerAchievements.extensionJson })
          .from(careerAchievements)
          .where(eq(careerAchievements.stableKey, key))
          .get()?.value ?? null
      )
    case 'projects':
      return (
        executor
          .select({ value: careerProjects.extensionJson })
          .from(careerProjects)
          .where(eq(careerProjects.stableKey, key))
          .get()?.value ?? null
      )
    case 'stories':
      return (
        executor
          .select({ value: careerStories.extensionJson })
          .from(careerStories)
          .where(eq(careerStories.stableKey, key))
          .get()?.value ?? null
      )
    case 'publications':
      return (
        executor
          .select({ value: careerPublications.extensionJson })
          .from(careerPublications)
          .where(eq(careerPublications.stableKey, key))
          .get()?.value ?? null
      )
    case 'personalSkills': {
      const row = executor
        .select({ value: careerSkills.extensionJson })
        .from(careerSkills)
        .innerJoin(skills, eq(skills.id, careerSkills.skillId))
        .where(eq(skills.key, key))
        .get()
      return row?.value ?? null
    }
    case 'baseResumes': {
      const parts = splitBaseResumeKey(key)
      if (!parts) return null
      return (
        executor
          .select({ value: careerBaseResumes.extensionJson })
          .from(careerBaseResumes)
          .where(
            and(
              eq(careerBaseResumes.directionKey, parts.directionKey),
              eq(careerBaseResumes.version, parts.version),
            ),
          )
          .get()?.value ?? null
      )
    }
    default:
      // Kinds with no extension column (categories, catalog, directions) have
      // nowhere to store authored extras.
      return null
  }
}

/** Splits `<directionKey>#<version>`; a malformed key names no version. */
function splitBaseResumeKey(key: string): { directionKey: string; version: string } | null {
  const separator = key.indexOf('#')
  if (separator <= 0) return null
  const version = key.slice(separator + 1)
  return version === '' ? null : { directionKey: key.slice(0, separator), version }
}

/** Parses one owning row's `extension_json`; `{}` is an empty stored object. */
function readStored(
  executor: DbExecutor,
  kind: string,
  key: string,
): Record<string, unknown> | null {
  const raw = readExtensionColumn(executor, kind, key)
  if (raw === null) return null
  return extensionObjectOrNull(parseJsonColumn(raw, extensionSchema, {}, `${kind}.extension_json`))
}

/**
 * Reads one record's preserved extension fields from its owning row's
 * `extension_json` column. Returns `null` when nothing is stored, so a caller
 * can distinguish "no preserved fields" from an empty edit.
 */
export function storedRecordExtensions(
  executor: DbExecutor,
  kind: string,
  key: string,
): Record<string, unknown> | null {
  return readStored(executor, kind, key)
}

/**
 * Writes one record's preserved extension fields into its owning row. Returns
 * `true` only for a real change; an identical write is invisible, and clearing
 * the last field stores NULL rather than an empty object. A write bumps the
 * row's `updated_at` so the computed change probe (and therefore the assembler
 * cache) sees it, without touching the row's optimistic-locking `revision`.
 */
export function writeRecordExtensions(
  executor: CareerDb,
  kind: string,
  key: string,
  value: Record<string, unknown> | null,
): boolean {
  const current = readStored(executor, kind, key)
  const next = value && Object.keys(value).length > 0 ? value : null
  if (stableFingerprint(current) === stableFingerprint(next)) return false
  return writeExtensionColumn(executor, kind, key, next === null ? null : serializeJsonColumn(next))
}

/** Parses `key = value` text against the stored value and persists the result. */
export function saveRecordExtensions(
  executor: CareerDb,
  kind: string,
  key: string,
  text: string | undefined,
): boolean {
  const current = storedRecordExtensions(executor, kind, key)
  return writeRecordExtensions(executor, kind, key, parseExtensionLines(current, text))
}

function writeExtensionColumn(
  executor: CareerDb,
  kind: string,
  key: string,
  value: string | null,
): boolean {
  const set = { extensionJson: value, updatedAt: nowISO() }
  switch (kind) {
    case 'candidate':
    case 'preferences':
      return (
        executor
          .update(careerProfile)
          .set(set)
          .where(eq(careerProfile.id, 1))
          .returning({ id: careerProfile.id })
          .all().length > 0
      )
    case 'education':
      return (
        executor
          .update(careerEducation)
          .set(set)
          .where(eq(careerEducation.stableKey, key))
          .returning({ id: careerEducation.id })
          .all().length > 0
      )
    case 'experiences':
      return (
        executor
          .update(careerExperiences)
          .set(set)
          .where(eq(careerExperiences.stableKey, key))
          .returning({ id: careerExperiences.id })
          .all().length > 0
      )
    case 'achievements':
      return (
        executor
          .update(careerAchievements)
          .set(set)
          .where(eq(careerAchievements.stableKey, key))
          .returning({ id: careerAchievements.id })
          .all().length > 0
      )
    case 'projects':
      return (
        executor
          .update(careerProjects)
          .set(set)
          .where(eq(careerProjects.stableKey, key))
          .returning({ id: careerProjects.id })
          .all().length > 0
      )
    case 'stories':
      return (
        executor
          .update(careerStories)
          .set(set)
          .where(eq(careerStories.stableKey, key))
          .returning({ id: careerStories.id })
          .all().length > 0
      )
    case 'publications':
      return (
        executor
          .update(careerPublications)
          .set(set)
          .where(eq(careerPublications.stableKey, key))
          .returning({ id: careerPublications.id })
          .all().length > 0
      )
    case 'personalSkills': {
      const skill = executor.select({ id: skills.id }).from(skills).where(eq(skills.key, key)).get()
      if (!skill) return false
      return (
        executor
          .update(careerSkills)
          .set(set)
          .where(eq(careerSkills.skillId, skill.id))
          .returning({ id: careerSkills.id })
          .all().length > 0
      )
    }
    case 'baseResumes': {
      const parts = splitBaseResumeKey(key)
      if (!parts) return false
      return (
        executor
          .update(careerBaseResumes)
          .set(set)
          .where(
            and(
              eq(careerBaseResumes.directionKey, parts.directionKey),
              eq(careerBaseResumes.version, parts.version),
            ),
          )
          .returning({ id: careerBaseResumes.id })
          .all().length > 0
      )
    }
    default:
      return false
  }
}
