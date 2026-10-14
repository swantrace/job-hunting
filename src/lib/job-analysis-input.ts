import { asc, eq } from 'drizzle-orm'
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import { jobAnalysisPromptVersion } from '../ai/prompts/job-analysis'
import { jobParserPromptVersion } from '../ai/prompts/job-parser'
import { jobAnalysisSchemaVersion } from '../ai/schemas/job-analysis'
import { db } from '../db/client'
import * as schema from '../db/schema'
import { skillAliases, skillCategories, skills } from '../db/schema'
import type { DbExecutor } from '../db/skill-queries'
import { canonicalHash } from './canonical-hash'

export const jobAnalysisInputVersion = 1

/**
 * The five inputs that determine a Job Analysis run's identity. Model-only
 * configuration is deliberately excluded: changing the configured model never
 * makes a completed analysis stale, though a user may still rerun explicitly.
 */
export type JobAnalysisInputParts = {
  contentHash: string
  taxonomyHash: string
  parserPromptVersion: string
  jobAnalysisPromptVersion: string
  jobAnalysisSchemaVersion: string
}

export type JobAnalysisInput = JobAnalysisInputParts & { version: typeof jobAnalysisInputVersion }

export function canonicalJobAnalysisInputHash(input: JobAnalysisInputParts): string {
  return canonicalHash(input)
}

/**
 * Stable hash of the controlled category vocabulary supplied to the parser,
 * read from `skill_categories`. Only the category keys are consumed, so a label
 * or display-order edit never invalidates a completed extraction or, through it,
 * unrelated documents. Adding or removing a category is a real vocabulary
 * change and does.
 */
export function taxonomyFingerprint(executor: DbExecutor = db): string {
  const categories = executor
    .select({ key: skillCategories.key })
    .from(skillCategories)
    .orderBy(asc(skillCategories.key))
    .all()
    .map((category) => category.key)
  return canonicalHash({ schemaVersion: 1, categories })
}

/**
 * Bounded catalog fingerprint: the category vocabulary plus the approved
 * catalog keys/names and their curated aliases, canonically hashed. This is the
 * separate *resolution* identity (Step 5): a catalog edit permits remapping
 * without repeating a paid JD extraction, so it is intentionally not part of the
 * Job Analysis input identity above.
 */
export function catalogFingerprint(executor: DbExecutor = db): string {
  const categories = executor
    .select({
      key: skillCategories.key,
      label: skillCategories.label,
      sortOrder: skillCategories.sortOrder,
    })
    .from(skillCategories)
    .orderBy(asc(skillCategories.sortOrder), asc(skillCategories.key))
    .all()
  const catalog = executor
    .select({ key: skills.key, name: skills.name })
    .from(skills)
    .where(eq(skills.reviewStatus, 'approved'))
    .orderBy(asc(skills.key))
    .all()
  const aliases = executor
    .select({ skillKey: skills.key, alias: skillAliases.alias })
    .from(skillAliases)
    .innerJoin(skills, eq(skillAliases.skillId, skills.id))
    .where(eq(skills.reviewStatus, 'approved'))
    .orderBy(asc(skills.key), asc(skillAliases.normalizedAlias))
    .all()
  return canonicalHash({ categories, catalog, aliases })
}

/**
 * Builds the frozen input snapshot and its compact hash from a normalized raw
 * post content hash. Serialization is canonical and independent of read order,
 * so a freshly saved draft and a later queued rerun hash identically.
 */
export function jobAnalysisInputFromContent(
  contentHash: string,
  executor: DbExecutor = db,
): {
  snapshot: JobAnalysisInput
  inputHash: string
} {
  const parts: JobAnalysisInputParts = {
    contentHash,
    taxonomyHash: taxonomyFingerprint(executor),
    parserPromptVersion: jobParserPromptVersion,
    jobAnalysisPromptVersion: jobAnalysisPromptVersion,
    jobAnalysisSchemaVersion: jobAnalysisSchemaVersion,
  }
  const snapshot: JobAnalysisInput = { version: jobAnalysisInputVersion, ...parts }
  return { snapshot, inputHash: canonicalJobAnalysisInputHash(parts) }
}

export type JobAnalysisInputDb = BunSQLiteDatabase<typeof schema>

export function buildJobAnalysisInput(db: JobAnalysisInputDb, jobPostingId: number) {
  const posting = db
    .select()
    .from(schema.jobPostings)
    .where(eq(schema.jobPostings.id, jobPostingId))
    .get()
  if (!posting) return null
  return jobAnalysisInputFromContent(posting.contentHash, db)
}

export function currentJobAnalysisHash(
  db: JobAnalysisInputDb,
  jobPostingId: number,
): string | null {
  return buildJobAnalysisInput(db, jobPostingId)?.inputHash ?? null
}
