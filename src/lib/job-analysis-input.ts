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
import {
  buildCatalogContext,
  type CatalogContext,
  type CatalogContextEntry,
} from './skills/catalog-context'

export const jobAnalysisInputVersion = 3

/**
 * The inputs that determine a Job Analysis run's *extraction* identity. The
 * catalog is deliberately absent: resolution is a separate, deterministic step
 * over the stored raw terms, so a catalog edit enables remapping without
 * repeating the paid extraction. Model-only configuration is excluded too, so
 * changing the configured model never makes a completed analysis stale.
 */
export type JobAnalysisInputParts = {
  contentHash: string
  parserPromptVersion: string
  jobAnalysisPromptVersion: string
  jobAnalysisSchemaVersion: string
}

export type JobAnalysisInput = JobAnalysisInputParts & {
  version: typeof jobAnalysisInputVersion
  /**
   * Frozen *resolution* identity: the approved catalog vocabulary this run's
   * raw terms were resolved against. Recorded in the snapshot (never hashed
   * into the extraction identity) so a later catalog edit can be detected and
   * remapped without another paid JD parse.
   */
  resolutionFingerprint: string
  /**
   * The bounded catalog retrieved from the raw posting text and supplied to the
   * paid extraction. The prompt block and the persistence/resolution step consume
   * this exact set, so prompt and resolution can never disagree; its
   * `fingerprint` hashes exactly those entries.
   */
  suppliedCatalog: CatalogContext
}

export function canonicalJobAnalysisInputHash(input: JobAnalysisInputParts): string {
  return canonicalHash(input)
}

/**
 * Stable hash of the controlled category vocabulary, read from
 * `skill_categories`. Only the category keys are consumed, so a label or
 * display-order edit never changes a resolution identity.
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
 * Resolution fingerprint: the category vocabulary plus the approved, unmerged
 * catalog keys/names and their curated aliases, canonically hashed. Only
 * identity-bearing values are hashed, so a category display order or label edit
 * does not pretend the catalog identity changed.
 */
export function catalogFingerprint(executor: DbExecutor = db): string {
  const categories = taxonomyFingerprint(executor)
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
  return canonicalHash({ schemaVersion: 2, categories, catalog, aliases })
}

/** Reads the recorded resolution identity, or null for a legacy snapshot. */
export function frozenResolutionFingerprint(
  frozenInputJson: string | null | undefined,
): string | null {
  if (!frozenInputJson) return null
  try {
    const parsed = JSON.parse(frozenInputJson) as { resolutionFingerprint?: unknown }
    return typeof parsed.resolutionFingerprint === 'string' ? parsed.resolutionFingerprint : null
  } catch {
    return null
  }
}

/**
 * Reads the frozen supplied catalog from a run snapshot. A legacy snapshot
 * (before the catalog was supplied) yields an empty list, so an old run resolves
 * nothing rather than failing.
 */
export function frozenSuppliedCatalog(
  frozenInputJson: string | null | undefined,
): CatalogContextEntry[] {
  if (!frozenInputJson) return []
  try {
    const parsed = JSON.parse(frozenInputJson) as {
      suppliedCatalog?: { entries?: unknown }
    }
    const entries = parsed.suppliedCatalog?.entries
    if (!Array.isArray(entries)) return []
    return entries.flatMap((entry) => {
      const value = entry as Partial<CatalogContextEntry>
      if (typeof value.key !== 'string' || typeof value.name !== 'string') return []
      return [
        {
          key: value.key,
          name: value.name,
          category: typeof value.category === 'string' ? value.category : null,
          aliases: Array.isArray(value.aliases)
            ? value.aliases.filter((alias): alias is string => typeof alias === 'string')
            : [],
        },
      ]
    })
  } catch {
    return []
  }
}

/**
 * Builds the frozen input snapshot and its compact hash from a normalized raw
 * post content hash. The bounded catalog supplied to the extraction is
 * retrieved deterministically from the raw post text, frozen here, and reused by
 * the worker for both the prompt and resolution. Serialization is canonical and
 * independent of read order, so a freshly saved draft and a later queued rerun
 * hash identically.
 */
export function jobAnalysisInputFromContent(
  contentHash: string,
  rawText: string,
  executor: DbExecutor = db,
): {
  snapshot: JobAnalysisInput
  inputHash: string
} {
  const parts: JobAnalysisInputParts = {
    contentHash,
    parserPromptVersion: jobParserPromptVersion,
    jobAnalysisPromptVersion: jobAnalysisPromptVersion,
    jobAnalysisSchemaVersion: jobAnalysisSchemaVersion,
  }
  const snapshot: JobAnalysisInput = {
    version: jobAnalysisInputVersion,
    ...parts,
    resolutionFingerprint: catalogFingerprint(executor),
    suppliedCatalog: buildCatalogContext(executor, { text: rawText }),
  }
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
  return jobAnalysisInputFromContent(posting.contentHash, posting.rawText, db)
}

export function currentJobAnalysisHash(
  db: JobAnalysisInputDb,
  jobPostingId: number,
): string | null {
  return buildJobAnalysisInput(db, jobPostingId)?.inputHash ?? null
}
