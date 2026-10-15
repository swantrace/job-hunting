import { and, asc, eq } from 'drizzle-orm'
import {
  occurrencesSchema,
  parseJsonColumn,
  type SourceOccurrence,
  serializeJsonColumn,
} from '../lib/career/json-schemas'
import { nowISO } from '../lib/date'
import type { SkillImportance } from '../lib/skills/constants'
import { normalizeSkillAlias } from '../lib/skills/normalize'
import { type CareerDb, CareerReferenceError, stableFingerprint } from './career-shared'
import { db } from './client'
import {
  type JobRequirementSkillMention,
  jobRequirementSkillMentions,
  jobRequirements,
  skills,
} from './schema'
import type { DbExecutor } from './skill-queries'

/**
 * Requirement-owned unresolved skill terms. A mention belongs to the job
 * requirement that produced it, never to the candidate: this module never
 * creates a catalog skill, a catalog alias or a personal `career_skills` row.
 * Unmapped and skipped terms stay available for gap history, and an explicit
 * Skip is the only way a term becomes skipped — blank input never is.
 */

export type MentionMappingState = 'pending' | 'mapped' | 'skipped'

export type MentionRecord = Omit<JobRequirementSkillMention, 'occurrencesJson'> & {
  occurrences: SourceOccurrence[]
}

export type MentionWithRequirement = MentionRecord & {
  requirementSequence: number
  requirementStatement: string
  importance: SkillImportance
}

export type CanonicalSkillSource = {
  mentionId: number
  requirementId: number
  requirementSequence: number
  requirementStatement: string
  importance: SkillImportance
  rawTerm: string
  normalizedTerm: string
}

export type CanonicalSkillGroup = {
  skillId: number
  skillKey: string
  skillName: string
  category: string | null
  importance: SkillImportance
  sources: CanonicalSkillSource[]
}

export type PendingMentionInput = {
  jobRequirementId: number
  rawTerm: string
  normalizedTerm: string
  occurrences: SourceOccurrence[]
  /** Audit date shared with the owning requirement row; defaults to now. */
  date?: string
}

const importanceRank: Record<SkillImportance, number> = {
  required: 3,
  preferred: 2,
  mentioned: 1,
}

/** Decodes one stored mention row's JSON occurrences for service callers. */
export function mentionToRecord(row: JobRequirementSkillMention): MentionRecord {
  return {
    ...row,
    occurrences: parseJsonColumn(
      row.occurrencesJson,
      occurrencesSchema,
      [],
      'job_requirement_skill_mentions.occurrences_json',
    ),
  }
}

function requireMention(tx: CareerDb, id: number): JobRequirementSkillMention {
  const row = tx
    .select()
    .from(jobRequirementSkillMentions)
    .where(eq(jobRequirementSkillMentions.id, id))
    .get()
  if (!row) throw new CareerReferenceError(`Skill mention ${id} does not exist.`)
  return row
}

function mergeOccurrences(
  existing: SourceOccurrence[],
  incoming: SourceOccurrence[],
): SourceOccurrence[] {
  const merged = [...existing]
  for (const occurrence of incoming) {
    const encoded = JSON.stringify(occurrence)
    if (!merged.some((candidate) => JSON.stringify(candidate) === encoded)) merged.push(occurrence)
  }
  return merged
}

export function listRequirementMentions(
  executor: DbExecutor,
  jobRequirementId: number,
): MentionRecord[] {
  return executor
    .select()
    .from(jobRequirementSkillMentions)
    .where(eq(jobRequirementSkillMentions.jobRequirementId, jobRequirementId))
    .orderBy(asc(jobRequirementSkillMentions.id))
    .all()
    .map(mentionToRecord)
}

/**
 * Every mention of one Job Analysis run, including pending and skipped terms.
 * This is the separate report for unmapped/skipped raw terms; they never become
 * catalog skills.
 */
export function listAnalysisMentions(
  executor: DbExecutor,
  jobPostingAnalysisId: number,
): MentionWithRequirement[] {
  return executor
    .select({
      mention: jobRequirementSkillMentions,
      requirementSequence: jobRequirements.sequence,
      requirementStatement: jobRequirements.statement,
      importance: jobRequirements.importance,
    })
    .from(jobRequirementSkillMentions)
    .innerJoin(
      jobRequirements,
      eq(jobRequirementSkillMentions.jobRequirementId, jobRequirements.id),
    )
    .where(eq(jobRequirements.jobPostingAnalysisId, jobPostingAnalysisId))
    .orderBy(asc(jobRequirements.sequence), asc(jobRequirementSkillMentions.id))
    .all()
    .map((row) => ({
      ...mentionToRecord(row.mention),
      requirementSequence: row.requirementSequence,
      requirementStatement: row.requirementStatement,
      importance: row.importance,
    }))
}

/**
 * One row per canonical skill id for a Job Analysis run, aggregating every
 * requirement source that maps to it and the strongest importance
 * (`required` > `preferred` > `mentioned`). Distinct requirement statements are
 * preserved as separate sources and are never merged into one.
 */
export function listCanonicalSkillGroups(
  executor: DbExecutor,
  jobPostingAnalysisId: number,
): CanonicalSkillGroup[] {
  const rows = executor
    .select({
      mention: jobRequirementSkillMentions,
      requirementId: jobRequirements.id,
      requirementSequence: jobRequirements.sequence,
      requirementStatement: jobRequirements.statement,
      importance: jobRequirements.importance,
      skillId: skills.id,
      skillKey: skills.key,
      skillName: skills.name,
      category: skills.category,
    })
    .from(jobRequirementSkillMentions)
    .innerJoin(
      jobRequirements,
      eq(jobRequirementSkillMentions.jobRequirementId, jobRequirements.id),
    )
    .innerJoin(skills, eq(jobRequirementSkillMentions.resolvedSkillId, skills.id))
    .where(
      and(
        eq(jobRequirements.jobPostingAnalysisId, jobPostingAnalysisId),
        eq(jobRequirementSkillMentions.mappingState, 'mapped'),
      ),
    )
    .orderBy(asc(jobRequirements.sequence), asc(jobRequirementSkillMentions.id))
    .all()

  const groups = new Map<number, CanonicalSkillGroup>()
  for (const row of rows) {
    const group = groups.get(row.skillId) ?? {
      skillId: row.skillId,
      skillKey: row.skillKey,
      skillName: row.skillName,
      category: row.category,
      importance: row.importance,
      sources: [],
    }
    if (importanceRank[row.importance] > importanceRank[group.importance]) {
      group.importance = row.importance
    }
    group.sources.push({
      mentionId: row.mention.id,
      requirementId: row.requirementId,
      requirementSequence: row.requirementSequence,
      requirementStatement: row.requirementStatement,
      importance: row.importance,
      rawTerm: row.mention.rawTerm,
      normalizedTerm: row.mention.normalizedTerm,
    })
    groups.set(row.skillId, group)
  }

  return [...groups.values()].sort(
    (left, right) =>
      importanceRank[right.importance] - importanceRank[left.importance] ||
      left.skillName.localeCompare(right.skillName) ||
      left.skillId - right.skillId,
  )
}

/**
 * Inserts or updates one `pending` mention keyed by
 * `(jobRequirementId, normalizedTerm)`. Repeated parses merge their source
 * occurrences instead of duplicating the term. A mention that already carries
 * an explicit mapped/skipped decision is left untouched so a decision is never
 * silently reset. No catalog skill, alias or personal evidence is ever created.
 */
export function upsertPendingMention(
  executor: CareerDb,
  input: PendingMentionInput,
): MentionRecord {
  const rawTerm = input.rawTerm.trim()
  if (rawTerm === '') throw new CareerReferenceError('A skill mention requires a raw term.')
  const normalizedTerm = normalizeSkillAlias(input.normalizedTerm)
  if (normalizedTerm === '') {
    throw new CareerReferenceError('A skill mention requires a normalized term.')
  }
  const occurrences = occurrencesSchema.parse(input.occurrences)
  return executor.transaction((tx) => {
    const requirement = tx
      .select()
      .from(jobRequirements)
      .where(eq(jobRequirements.id, input.jobRequirementId))
      .get()
    if (!requirement) {
      throw new CareerReferenceError(`Job requirement ${input.jobRequirementId} does not exist.`)
    }
    const existing =
      tx
        .select()
        .from(jobRequirementSkillMentions)
        .where(
          and(
            eq(jobRequirementSkillMentions.jobRequirementId, input.jobRequirementId),
            eq(jobRequirementSkillMentions.normalizedTerm, normalizedTerm),
          ),
        )
        .get() ?? null
    if (existing) {
      const record = mentionToRecord(existing)
      if (existing.mappingState !== 'pending') return record
      const merged = mergeOccurrences(record.occurrences, occurrences)
      const content = { rawTerm, occurrences: merged }
      if (
        stableFingerprint(content) ===
        stableFingerprint({ rawTerm: existing.rawTerm, occurrences: record.occurrences })
      ) {
        return record
      }
      const revision = existing.revision + 1
      const updatedAt = input.date ?? nowISO()
      tx.update(jobRequirementSkillMentions)
        .set({
          rawTerm,
          occurrencesJson: serializeJsonColumn(merged),
          revision,
          updatedAt,
        })
        .where(eq(jobRequirementSkillMentions.id, existing.id))
        .run()
      return { ...record, rawTerm, occurrences: merged, revision, updatedAt }
    }
    const now = input.date ?? nowISO()
    const inserted = tx
      .insert(jobRequirementSkillMentions)
      .values({
        jobRequirementId: input.jobRequirementId,
        rawTerm,
        normalizedTerm,
        mappingState: 'pending',
        resolvedSkillId: null,
        occurrencesJson: serializeJsonColumn(occurrences),
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get()
    return mentionToRecord(inserted)
  })
}

/**
 * Maps a mention to an existing approved, unmerged catalog skill. The mention
 * row is the single mapping store: `job_requirements_to_skills` is a read-only
 * view derived from this row, so no junction is written. `raw_label` and
 * `confidence` in that view come from `raw_term` and `occurrences_json`. It
 * never creates a catalog skill and never creates a personal `career_skills`
 * row.
 */
export function mapMention(
  executor: CareerDb,
  mentionId: number,
  skillId: number,
  date?: string,
): MentionRecord {
  return executor.transaction((tx) => {
    const mention = requireMention(tx, mentionId)
    const skill = tx.select().from(skills).where(eq(skills.id, skillId)).get()
    if (!skill) throw new CareerReferenceError(`Catalog skill ${skillId} does not exist.`)
    if (skill.reviewStatus === 'merged' || skill.mergedIntoSkillId !== null) {
      throw new CareerReferenceError(`Catalog skill "${skill.key}" is merged and cannot be mapped.`)
    }
    if (skill.reviewStatus !== 'approved') {
      throw new CareerReferenceError(
        `Catalog skill "${skill.key}" is ${skill.reviewStatus}; only approved catalog skills can be mapped.`,
      )
    }
    const record = mentionToRecord(mention)
    if (mention.mappingState === 'mapped' && mention.resolvedSkillId === skillId) return record
    const revision = mention.revision + 1
    const updatedAt = date ?? nowISO()
    tx.update(jobRequirementSkillMentions)
      .set({ mappingState: 'mapped', resolvedSkillId: skillId, revision, updatedAt })
      .where(eq(jobRequirementSkillMentions.id, mentionId))
      .run()
    return { ...record, mappingState: 'mapped', resolvedSkillId: skillId, revision, updatedAt }
  })
}

function setMentionState(
  executor: CareerDb,
  mentionId: number,
  state: 'pending' | 'skipped',
): MentionRecord {
  return executor.transaction((tx) => {
    const mention = requireMention(tx, mentionId)
    const record = mentionToRecord(mention)
    if (mention.mappingState === state && mention.resolvedSkillId === null) return record
    const revision = mention.revision + 1
    const updatedAt = nowISO()
    tx.update(jobRequirementSkillMentions)
      .set({ mappingState: state, resolvedSkillId: null, revision, updatedAt })
      .where(eq(jobRequirementSkillMentions.id, mentionId))
      .run()
    return { ...record, mappingState: state, resolvedSkillId: null, revision, updatedAt }
  })
}

/**
 * Explicitly skips a mention. Skip is always an explicit decision for a known
 * mention id, and blank or whitespace input is never treated as a skip. Clearing
 * `resolved_skill_id` removes the mention from the derived mapping view.
 */
export function skipMention(executor: CareerDb, mentionId: number): MentionRecord {
  return setMentionState(executor, mentionId, 'skipped')
}

/** Returns a mention to `pending`, which also removes it from the mapping view. */
export function resetMention(executor: CareerDb, mentionId: number): MentionRecord {
  return setMentionState(executor, mentionId, 'pending')
}

/**
 * Readiness chaining: zero pending mentions is the only state that allows
 * auto-chaining.
 */
export function countPendingMentions(executor: DbExecutor, jobPostingAnalysisId: number): number {
  return executor
    .select({ id: jobRequirementSkillMentions.id })
    .from(jobRequirementSkillMentions)
    .innerJoin(
      jobRequirements,
      eq(jobRequirementSkillMentions.jobRequirementId, jobRequirements.id),
    )
    .where(
      and(
        eq(jobRequirements.jobPostingAnalysisId, jobPostingAnalysisId),
        eq(jobRequirementSkillMentions.mappingState, 'pending'),
      ),
    )
    .all().length
}
