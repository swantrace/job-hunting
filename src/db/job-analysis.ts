import { asc, eq } from 'drizzle-orm'
import { type JobAnalysisRequirement, type SkillReference } from '../ai/schemas/job-analysis'
import { normalizeSkillAlias } from '../lib/skills/normalize'
import type { SkillCategory } from '../lib/skills/taxonomy'
import { db } from './client'
import {
  type JobPostingAnalysis,
  type JobRequirement,
  jobRequirements,
  jobRequirementsToSkills,
} from './schema'
import {
  addAliasIfAbsent,
  type DbExecutor,
  insertSkill,
  resolveApprovedSkill,
  resolveSkill,
} from './skill-queries'

export type JobRequirementSkillInput = {
  rawLabel: string
  canonicalLabel: string
  category: SkillCategory
  confidence: number
}

export type JobRequirementInput = {
  type: JobAnalysisRequirement['type']
  importance: JobAnalysisRequirement['importance']
  basis: JobAnalysisRequirement['basis'] | 'legacy'
  statement: string
  sourceText: string | null
  inferenceRationale: string | null
  skillReferences?: JobRequirementSkillInput[]
}

/**
 * Persists the requirement-owned skill references as canonical junction rows.
 * Approved skills are reused, unknown concepts become pending skills only at
 * save/completion time, and each mapping keeps its exact raw label and parser
 * confidence. The owning requirement supplies source and importance context, so
 * the same skill can be mapped by several requirements without losing either.
 */
export function persistRequirementSkills(
  tx: DbExecutor,
  jobRequirementId: number,
  references: JobRequirementSkillInput[],
) {
  for (const reference of references) {
    const canonicalLabel = reference.canonicalLabel.trim() || reference.rawLabel.trim()
    const canonical = normalizeSkillAlias(canonicalLabel)
    let skill = resolveApprovedSkill(tx, canonical)
    if (!skill) skill = resolveSkill(tx, canonical)
    if (!skill)
      skill = insertSkill(tx, {
        name: canonicalLabel,
        category: reference.category,
        reviewStatus: 'pending',
        origin: 'job-parser',
      })
    const rawLabel = reference.rawLabel.trim() || canonicalLabel
    addAliasIfAbsent(tx, skill.id, rawLabel, 'job-parser')
    tx.insert(jobRequirementsToSkills)
      .values({
        jobRequirementId,
        skillId: skill.id,
        rawLabel,
        confidence: reference.confidence,
      })
      .onConflictDoNothing()
      .run()
  }
}

/**
 * Replaces the normalized requirement rows for one analysis and, in the same
 * transaction, persists each requirement's skill references into the canonical
 * `job_requirements_to_skills` junction. Sequence follows the deterministic
 * posting order supplied by the caller; the caller is responsible for
 * validating the input against `jobAnalysisSchema` before persisting.
 */
export function persistJobRequirements(
  tx: DbExecutor,
  jobPostingAnalysisId: number,
  requirements: JobRequirementInput[],
  date: string,
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
    persistRequirementSkills(tx, saved.id, requirement.skillReferences ?? [])
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

export type { JobPostingAnalysis, JobRequirement, SkillReference }
