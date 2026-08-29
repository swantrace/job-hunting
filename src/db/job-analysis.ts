import { asc, eq } from 'drizzle-orm'
import type { JobAnalysisRequirement } from '../ai/schemas/job-analysis'
import { db } from './client'
import { type JobPostingAnalysis, type JobRequirement, jobRequirements } from './schema'
import type { DbExecutor } from './skill-queries'

export type JobRequirementInput = {
  type: JobAnalysisRequirement['type']
  importance: JobAnalysisRequirement['importance']
  basis: JobAnalysisRequirement['basis'] | 'legacy'
  statement: string
  sourceText: string | null
  inferenceRationale: string | null
}

/**
 * Replaces the normalized requirement rows for one analysis. Sequence follows
 * the deterministic posting order supplied by the caller; the caller is
 * responsible for validating the input against `jobAnalysisSchema` before
 * persisting.
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
    tx.insert(jobRequirements)
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
      .run()
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
