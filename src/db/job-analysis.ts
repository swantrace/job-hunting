import { asc, eq } from 'drizzle-orm'
import { type JobAnalysisRequirement, type RequirementTerm } from '../ai/schemas/job-analysis'
import { canonicalHash } from '../lib/canonical-hash'
import type { CatalogContextEntry } from '../lib/skills/catalog-context'
import {
  canonicalSkillKey,
  isMeaningfulSkillTerm,
  normalizeSkillAlias,
} from '../lib/skills/normalize'
import { type ResolvedMention, resolveRequirementTerms } from '../lib/skills/resolver'
import type { CareerDb } from './career-shared'
import { db } from './client'
import { type JobPostingAnalysis, type JobRequirement, jobRequirements, skills } from './schema'
import { mapMention, upsertPendingMention } from './skill-mentions'
import { resolveSkillByAlias, resolveSkillByKey } from './skill-queries'

export type JobRequirementTermInput = RequirementTerm

export type JobRequirementInput = {
  type: JobAnalysisRequirement['type']
  importance: JobAnalysisRequirement['importance']
  basis: JobAnalysisRequirement['basis'] | 'legacy'
  statement: string
  sourceText: string | null
  inferenceRationale: string | null
  /** Raw model-supplied terms; the server owns catalog resolution. */
  terms?: JobRequirementTermInput[]
}

/**
 * Persists requirement-owned mentions. Pending terms are stored as they were
 * parsed, and only a term the deterministic resolver verified against the
 * frozen catalog snapshot becomes a `job_requirements_to_skills` mapping (via
 * `mapMention`, which keeps the raw label and parser confidence).
 *
 * This never creates a catalog skill, a catalog alias, a category or personal
 * evidence: an unknown term stays pending until a human decides.
 */
export function persistRequirementMentions(
  tx: CareerDb,
  jobRequirementId: number,
  mentions: ResolvedMention[],
  date: string,
) {
  for (const mention of mentions) {
    if (!isMeaningfulSkillTerm(mention.rawTerm)) continue
    const stored = upsertPendingMention(tx, {
      jobRequirementId,
      rawTerm: mention.rawTerm,
      normalizedTerm: mention.normalizedTerm,
      occurrences: mention.occurrences,
      date,
    })
    if (stored.mappingState === 'skipped') continue
    const normalized = normalizeSkillAlias(mention.rawTerm)
    const exactName = tx
      .select()
      .from(skills)
      .all()
      .find((row) => normalizeSkillAlias(row.name) === normalized)
    let skill = mention.skillKey
      ? resolveSkillByKey(tx, mention.skillKey)
      : (resolveSkillByAlias(tx, normalized) ?? exactName ?? resolveSkillByKey(tx, normalized))
    if (!skill) {
      let key =
        canonicalSkillKey(mention.rawTerm) || `term-${canonicalHash(normalized).slice(0, 16)}`
      if (resolveSkillByKey(tx, key)) key += `-${canonicalHash(normalized).slice(0, 12)}`
      // All analysis completion writes run in one SQLite transaction. A second
      // concurrent completion resolves the already-created pending entry.
      tx.insert(skills)
        .values({
          name: mention.rawTerm,
          key,
          origin: 'job-parser',
          reviewStatus: 'pending',
          createdAt: date,
          updatedAt: date,
        })
        .onConflictDoNothing()
        .run()
      skill = resolveSkillByKey(tx, key)!
    }
    const seen = new Set<number>()
    while (skill.mergedIntoSkillId !== null) {
      if (seen.has(skill.id)) throw new Error('Invalid skill merge cycle.')
      seen.add(skill.id)
      const target = tx.select().from(skills).where(eq(skills.id, skill.mergedIntoSkillId)).get()
      if (!target) throw new Error('Skill merge target not found.')
      skill = target
    }
    mapMention(tx, stored.id, skill.id, date, true)
  }
}

/**
 * Replaces the normalized requirement rows for one analysis and, in the same
 * transaction, persists each requirement's raw skill terms as requirement-owned
 * mentions. `catalog` is the bounded snapshot already frozen for the run — the
 * same entries the paid prompt supplied — so resolution can never disagree with
 * what the model was allowed to propose, and a term outside it stays pending.
 * Sequence follows the deterministic posting order supplied by the caller; the
 * caller is responsible for validating the input against `jobAnalysisSchema`
 * before persisting.
 */
export function persistJobRequirements(
  tx: CareerDb,
  jobPostingAnalysisId: number,
  requirements: JobRequirementInput[],
  date: string,
  catalog: readonly CatalogContextEntry[] = [],
) {
  tx.delete(jobRequirements)
    .where(eq(jobRequirements.jobPostingAnalysisId, jobPostingAnalysisId))
    .run()
  for (const [index, requirement] of requirements.entries()) {
    const saved = tx
      .insert(jobRequirements)
      .values({
        jobPostingAnalysisId,
        sequence: index + 1,
        requirementType: requirement.type,
        importance: requirement.importance,
        basis: requirement.basis,
        statement: requirement.statement,
        sourceText: requirement.sourceText,
        inferenceRationale: requirement.inferenceRationale,
        createdAt: date,
        updatedAt: date,
      })
      .returning({ id: jobRequirements.id })
      .get()
    persistRequirementMentions(
      tx,
      saved.id,
      resolveRequirementTerms({ terms: requirement.terms ?? [], catalog }),
      date,
    )
  }
}

export function listJobRequirements(jobPostingAnalysisId: number): JobRequirement[] {
  return db
    .select()
    .from(jobRequirements)
    .where(eq(jobRequirements.jobPostingAnalysisId, jobPostingAnalysisId))
    .orderBy(asc(jobRequirements.sequence))
    .all()
}

export function getJobRequirementRows(analysisId: number): JobRequirement[] {
  return listJobRequirements(analysisId)
}

export type { JobPostingAnalysis, JobRequirement }
