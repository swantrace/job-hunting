import { getCandidateAnalysisState } from '../lib/candidate/analysis'
import { currentJobAnalysisHash } from '../lib/job-analysis/input'
import { db } from './client'
import { listJobRequirements } from './job-analysis'
import { getJobAnalysisState } from './job-analysis-runs'
import { getApplication } from './queries'
import { type AnalysisMappingData, loadAnalysisMapping } from './skill-mapping-service'
import { listRunSkillReviews } from './skill-queries'

/**
 * Single loader for the review workspace. Returns the full candidate-analysis
 * state, normalized job requirements from the current Job Analysis run,
 * run-scoped skill reviews, and the requirement-term mapping data so the
 * ReviewPanel and the mapping route render the same rows.
 */
export function loadReviewData(jobId: number) {
  const job = getApplication(jobId)
  const state = getCandidateAnalysisState(jobId)
  const jobState = job?.jobPosting
    ? getJobAnalysisState(db, job.jobPosting.id, currentJobAnalysisHash(db, job.jobPosting.id))
    : null
  const jobAnalysis = jobState?.currentCompleted ?? jobState?.latestCompleted ?? null
  const requirements = jobAnalysis ? listJobRequirements(jobAnalysis.id) : []
  const reviewRunId = state.currentCompleted?.id ?? state.latestCompleted?.id ?? null
  const requirementSkills = reviewRunId ? listRunSkillReviews(reviewRunId) : []
  const mapping: AnalysisMappingData = loadAnalysisMapping(db, jobAnalysis?.id ?? null)
  return {
    job,
    jobAnalysis,
    jobAnalysisCurrent: !!jobState?.currentCompleted,
    run: state.latest,
    state,
    requirements,
    requirementSkills,
    mapping,
  }
}
