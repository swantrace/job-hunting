import { and, asc, desc, eq, inArray, isNull, like, or } from 'drizzle-orm'
import { nowISO } from '../lib/date'
import { canonicalSkillKey, normalizeSkillAlias } from '../lib/skills/normalize'
import { hasSkillCategory } from '../lib/skills/taxonomy'
import { type CareerDb, CareerReferenceError } from './career-shared'
import { db } from './client'
import {
  jobPostingAnalyses,
  jobPostings,
  jobRequirementSkillMentions,
  jobRequirements,
  skillAliases,
  skills,
} from './schema'
import {
  type CanonicalSkillGroup,
  countPendingMentions,
  listAnalysisMentions,
  listCanonicalSkillGroups,
  type MentionRecord,
  type MentionWithRequirement,
  mapMention,
  mentionToRecord,
} from './skill-mentions'
import { addAliasIfAbsent, type DbExecutor, resolveSkillByAlias } from './skill-queries'

/**
 * Review mapping service. Wraps the Step 2 requirement-mention repository for
 * the mapping routes: bounded catalog search for the selector, explicit catalog
 * creation, and map/skip/remember-alias/reset mutations.
 *
 * Hard product rules enforced here rather than in the UI:
 * - mapping a term to a catalog skill never writes a `career_skills` row and
 *   never infers category-wide competence;
 * - creating a catalog skill creates no personal skill and no alias — exactly
 *   one global alias is written only by the explicit Remember-as-alias action;
 * - there is no fuzzy matching: only exact key / normalized display name /
 *   curated alias wording can find or collide with a catalog entry;
 * - every id arriving from a request is re-validated against the database, so a
 *   forged or foreign id fails closed instead of writing.
 */

/** Documented bound on selector results; a run never ships the whole catalog. */
export const catalogSearchLimit = 20
export const catalogSearchMaxLimit = 50

/**
 * The selector's "Create new skill…" option carries this prefix so one option
 * value can never be confused with a catalog skill id.
 */
export const createSkillOptionPrefix = 'create:'

/** The term carried by a `create:` selector value, or null when it is not one. */
export function createSkillTerm(value: string | undefined): string | null {
  const term = value?.startsWith(createSkillOptionPrefix)
    ? value.slice(createSkillOptionPrefix.length).trim()
    : ''
  return term === '' ? null : term
}

export type CatalogSearchResult = {
  id: number
  key: string
  name: string
  category: string | null
  aliases: string[]
}

export type CatalogSkillInput = {
  name: string
  category: string | null
}

export type CatalogCollisionField = 'key' | 'name' | 'alias' | 'category'

/** Actionable catalog collision, reported on the create form as a 422. */
export class CatalogSkillConflictError extends Error {
  constructor(
    readonly field: CatalogCollisionField,
    message: string,
  ) {
    super(message)
    this.name = 'CatalogSkillConflictError'
  }
}

export type AnalysisMentionRow = MentionWithRequirement & {
  /** Display name of the catalog skill this term resolved to, when mapped. */
  resolvedSkillName: string | null
  resolvedSkillKey: string | null
}

/** Everything the create form and the mapping routes need about one mention. */
export type MentionContext = {
  mentionId: number
  jobApplicationId: number
  jobPostingAnalysisId: number
  requirementId: number
  rawTerm: string
}

export type AnalysisMappingData = {
  jobPostingAnalysisId: number | null
  mentions: AnalysisMentionRow[]
  groups: CanonicalSkillGroup[]
  pendingCount: number
}

const importanceLabel = {
  required: 'Required',
  preferred: 'Preferred',
  mentioned: 'Mentioned',
} as const

export function importanceRankLabel(importance: AnalysisMentionRow['importance']): string {
  return importanceLabel[importance]
}

function boundedLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return catalogSearchLimit
  return Math.min(catalogSearchMaxLimit, Math.max(1, Math.trunc(limit)))
}

/**
 * Bounded, deterministic catalog search for the selector. Approved, unmerged
 * entries only; exact key / normalized display name / curated alias matches
 * rank first, then prefix matches, then substring matches. An empty query
 * returns the first bounded page of the catalog. No fuzzy matching, no model
 * call, and never the whole catalog.
 */
export function searchApprovedCatalog(
  executor: DbExecutor,
  query: string,
  limit: number = catalogSearchLimit,
): CatalogSearchResult[] {
  const capped = boundedLimit(limit)
  const trimmed = query.trim()
  const normalized = normalizeSkillAlias(query)
  const key = normalized === '' ? '' : canonicalSkillKey(trimmed)
  const pattern = `%${normalized.replace(/[\\%_]/g, '\\$&')}%`
  const searchable = and(eq(skills.reviewStatus, 'approved'), isNull(skills.mergedIntoSkillId))

  const rows = executor
    .select({ id: skills.id, key: skills.key, name: skills.name, category: skills.category })
    .from(skills)
    .where(
      normalized === ''
        ? searchable
        : and(
            searchable,
            or(
              eq(skills.key, key),
              eq(skills.name, trimmed),
              like(skills.key, pattern),
              like(skills.name, pattern),
            ),
          ),
    )
    .orderBy(asc(skills.name), asc(skills.id))
    .all()

  const byId = new Map<number, CatalogSearchResult>(
    rows.map((row) => [row.id, { ...row, aliases: [] }]),
  )

  if (normalized !== '') {
    const aliasRows = executor
      .select({
        id: skills.id,
        key: skills.key,
        name: skills.name,
        category: skills.category,
        alias: skillAliases.alias,
      })
      .from(skillAliases)
      .innerJoin(skills, eq(skillAliases.skillId, skills.id))
      .where(
        and(
          searchable,
          or(
            eq(skillAliases.normalizedAlias, normalized),
            like(skillAliases.normalizedAlias, pattern),
          ),
        ),
      )
      .orderBy(asc(skills.name), asc(skills.id))
      .all()
    for (const row of aliasRows) {
      const existing = byId.get(row.id) ?? {
        id: row.id,
        key: row.key,
        name: row.name,
        category: row.category,
        aliases: [],
      }
      if (!existing.aliases.includes(row.alias)) existing.aliases.push(row.alias)
      byId.set(row.id, existing)
    }
  }

  const rank = (entry: CatalogSearchResult) => {
    if (normalized === '') return 0
    if (entry.key === key || normalizeSkillAlias(entry.name) === normalized) return 0
    if (entry.aliases.some((alias) => normalizeSkillAlias(alias) === normalized)) return 0
    if (normalizeSkillAlias(entry.name).startsWith(normalized)) return 1
    return 2
  }

  return [...byId.values()]
    .sort(
      (left, right) =>
        rank(left) - rank(right) || left.name.localeCompare(right.name) || left.id - right.id,
    )
    .slice(0, capped)
}

/**
 * Creates an explicit user-authored catalog skill.
 *
 * `origin: 'manual'` and `reviewStatus: 'approved'` because the user asked for
 * this entry on purpose. Collisions against an existing key, normalized display
 * name or alias raise an actionable {@link CatalogSkillConflictError}; an
 * unknown category is rejected rather than stored. No `career_skills` row and no
 * alias row is written here.
 */
export function createCatalogSkill(executor: CareerDb, input: CatalogSkillInput): number {
  const name = input.name.trim()
  if (name === '') throw new CatalogSkillConflictError('name', 'Enter a skill name.')
  const category = input.category?.trim() ? input.category.trim() : null
  if (category && !hasSkillCategory(category, executor)) {
    throw new CatalogSkillConflictError('category', 'Choose a category from the current taxonomy.')
  }
  const key = canonicalSkillKey(name)
  const normalized = normalizeSkillAlias(name)
  if (key === '' || normalized === '') {
    throw new CatalogSkillConflictError('name', 'Enter a skill name with letters or digits.')
  }

  return executor.transaction((tx) => {
    const byKey = tx.select().from(skills).where(eq(skills.key, key)).get()
    if (byKey) {
      throw new CatalogSkillConflictError(
        'key',
        `The key "${byKey.key}" is already used by "${byKey.name}".`,
      )
    }
    const byAlias = resolveSkillByAlias(tx, normalized)
    if (byAlias) {
      throw new CatalogSkillConflictError(
        'alias',
        `"${byAlias.name}" already answers to "${name}". Map the term to the skill that already exists.`,
      )
    }
    const byName = tx.select().from(skills).where(eq(skills.name, name)).get()
    if (byName) {
      throw new CatalogSkillConflictError(
        'name',
        `The name "${byName.name}" is already used by the key "${byName.key}".`,
      )
    }

    const date = nowISO()
    return tx
      .insert(skills)
      .values({
        key,
        name,
        category,
        reviewStatus: 'approved',
        origin: 'manual',
        createdAt: date,
        updatedAt: date,
      })
      .returning()
      .get().id
  })
}

/**
 * Mapping data for one Job Analysis run: every requirement-owned mention in
 * occurrence order plus the canonical groups that already resolved
 * deterministically. Pending and skipped terms are included so history stays
 * visible; they are never turned into catalog records.
 */
export function loadAnalysisMapping(
  executor: DbExecutor,
  jobPostingAnalysisId: number | null,
): AnalysisMappingData {
  if (jobPostingAnalysisId === null) return emptyMappingData()
  const mentions = listAnalysisMentions(executor, jobPostingAnalysisId)
  const resolvedIds = [
    ...new Set(
      mentions.map((mention) => mention.resolvedSkillId).filter((id): id is number => id !== null),
    ),
  ]
  const resolved = resolvedIds.length
    ? executor
        .select({ id: skills.id, key: skills.key, name: skills.name })
        .from(skills)
        .where(inArray(skills.id, resolvedIds))
        .all()
    : []
  const byId = new Map(resolved.map((skill) => [skill.id, skill]))
  return {
    jobPostingAnalysisId,
    mentions: mentions.map((mention) => {
      const skill = mention.resolvedSkillId === null ? undefined : byId.get(mention.resolvedSkillId)
      return {
        ...mention,
        resolvedSkillKey: skill?.key ?? null,
        resolvedSkillName: skill?.name ?? null,
      }
    }),
    groups: listCanonicalSkillGroups(executor, jobPostingAnalysisId),
    pendingCount: countPendingMentions(executor, jobPostingAnalysisId),
  }
}

function emptyMappingData(): AnalysisMappingData {
  return { jobPostingAnalysisId: null, mentions: [], groups: [], pendingCount: 0 }
}

/**
 * Resolves one mention id to its owning application and Job Analysis run. A
 * forged, deleted or foreign id returns null, so a request can never write to
 * another application's data.
 */
export function loadMentionContext(
  mentionId: number,
  executor: DbExecutor = db,
): MentionContext | null {
  const row = executor
    .select({
      mentionId: jobRequirementSkillMentions.id,
      requirementId: jobRequirements.id,
      rawTerm: jobRequirementSkillMentions.rawTerm,
      jobPostingAnalysisId: jobRequirements.jobPostingAnalysisId,
      jobApplicationId: jobPostings.jobApplicationId,
    })
    .from(jobRequirementSkillMentions)
    .innerJoin(
      jobRequirements,
      eq(jobRequirementSkillMentions.jobRequirementId, jobRequirements.id),
    )
    .innerJoin(jobPostingAnalyses, eq(jobRequirements.jobPostingAnalysisId, jobPostingAnalyses.id))
    .innerJoin(jobPostings, eq(jobPostingAnalyses.jobPostingId, jobPostings.id))
    .where(eq(jobRequirementSkillMentions.id, mentionId))
    .get()
  if (!row) return null
  return {
    mentionId: row.mentionId,
    jobApplicationId: row.jobApplicationId,
    jobPostingAnalysisId: row.jobPostingAnalysisId,
    requirementId: row.requirementId,
    rawTerm: row.rawTerm,
  }
}

/** Maps one mention to an approved catalog skill, verified inside the write. */
export function saveMentionMapping(executor: CareerDb, mentionId: number, skillId: number) {
  return executor.transaction((tx) => {
    if (!loadMentionContext(mentionId, tx)) {
      throw new CareerReferenceError(`Skill mention ${mentionId} does not exist.`)
    }
    return mapMention(tx, mentionId, skillId)
  })
}

/**
 * The explicit, opt-in Remember-as-alias action: writes exactly one global
 * alias for the skill the mention is already mapped to. It is never implied by
 * mapping.
 */
export function rememberMentionAlias(
  executor: CareerDb,
  mentionId: number,
  alias: string,
): MentionRecord {
  const trimmed = alias.trim()
  if (trimmed === '') throw new CareerReferenceError('Enter the alias to remember.')
  return executor.transaction((tx) => {
    const context = loadMentionContext(mentionId, tx)
    if (!context) throw new CareerReferenceError(`Skill mention ${mentionId} does not exist.`)
    const mention = tx
      .select()
      .from(jobRequirementSkillMentions)
      .where(eq(jobRequirementSkillMentions.id, mentionId))
      .get()
    if (!mention?.resolvedSkillId) {
      throw new CareerReferenceError('Map the term to a catalog skill before remembering an alias.')
    }
    const normalized = normalizeSkillAlias(trimmed)
    const existing = tx
      .select()
      .from(skillAliases)
      .where(eq(skillAliases.normalizedAlias, normalized))
      .get()
    if (existing && existing.skillId !== mention.resolvedSkillId) {
      throw new CatalogSkillConflictError(
        'alias',
        `"${trimmed}" is already an alias of another catalog skill.`,
      )
    }
    addAliasIfAbsent(tx, mention.resolvedSkillId, trimmed, 'manual')
    return mentionToRecord(mention)
  })
}

/**
 * Every mention of the newest Job Analysis of one application, with its
 * requirement context. Used by the mutation routes to re-render the panel
 * without re-running a paid JD parse.
 */
export function loadApplicationMapping(executor: DbExecutor, jobId: number): AnalysisMappingData {
  const jobPostingAnalysisId = newestCompletedJobAnalysisId(executor, jobId)
  return loadAnalysisMapping(executor, jobPostingAnalysisId)
}

/** Newest completed Job Analysis run for one application, or null. */
export function newestCompletedJobAnalysisId(executor: DbExecutor, jobId: number): number | null {
  return (
    executor
      .select({ id: jobPostingAnalyses.id })
      .from(jobPostingAnalyses)
      .innerJoin(jobPostings, eq(jobPostingAnalyses.jobPostingId, jobPostings.id))
      .where(
        and(eq(jobPostings.jobApplicationId, jobId), eq(jobPostingAnalyses.status, 'Completed')),
      )
      .orderBy(desc(jobPostingAnalyses.id))
      .limit(1)
      .get()?.id ?? null
  )
}
