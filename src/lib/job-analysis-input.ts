import { eq } from 'drizzle-orm'
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import { jobAnalysisPromptVersion } from '../ai/prompts/job-analysis'
import { jobParserPromptVersion } from '../ai/prompts/job-parser'
import { jobAnalysisSchemaVersion } from '../ai/schemas/job-analysis'
import * as schema from '../db/schema'
import { canonicalHash } from './canonical-hash'
import { loadSkillTaxonomy } from './skills/taxonomy'

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

/** Stable hash of the controlled skill taxonomy supplied to the parser. */
export function skillTaxonomyHash(): string {
  return canonicalHash(loadSkillTaxonomy())
}

/**
 * Builds the frozen input snapshot and its compact hash from a normalized raw
 * post content hash. Serialization is canonical and independent of file read
 * order, so a freshly saved draft and a later queued rerun hash identically.
 */
export function jobAnalysisInputFromContent(contentHash: string): {
  snapshot: JobAnalysisInput
  inputHash: string
} {
  const parts: JobAnalysisInputParts = {
    contentHash,
    taxonomyHash: skillTaxonomyHash(),
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
  return jobAnalysisInputFromContent(posting.contentHash)
}

export function currentJobAnalysisHash(
  db: JobAnalysisInputDb,
  jobPostingId: number,
): string | null {
  return buildJobAnalysisInput(db, jobPostingId)?.inputHash ?? null
}
