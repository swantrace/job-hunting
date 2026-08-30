import { getCandidateAnalysisState } from '../lib/candidate-analysis'
import { currentJobAnalysisHash } from '../lib/job-analysis-input'
import { listProfiles } from '../lib/profiles'
import { db } from './client'
import { listJobRequirements } from './job-analysis'
import { getJobAnalysisState } from './job-analysis-runs'
import { getApplication } from './queries'
import { listRunSkillReviews } from './skill-queries'

/**
 * Single loader for the review workspace. Returns the full candidate-analysis
 * state (latest attempt, latest completed, current completed, stale completed,
 * and reason codes), normalized job requirements from the current Job Analysis
 * run, run-scoped skill reviews, and available profiles so the ReviewPanel and
 * the analysis-runs fragment route render the same data.
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
  return {
    job,
    run: state.latest,
    state,
    requirements,
    requirementSkills,
    profiles: listProfiles(),
  }
}
