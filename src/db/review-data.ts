import { getCandidateAnalysisState } from '../lib/candidate-analysis'
import { listProfiles } from '../lib/profiles'
import { listJobRequirements } from './job-analysis'
import { getApplication } from './queries'

/**
 * Single loader for the review workspace. Returns the full candidate-analysis
 * state (latest attempt, latest completed, current completed, stale completed,
 * and reason codes), normalized job requirements, and available profiles so the
 * ReviewPanel and the analysis-runs fragment route render the same data.
 */
export function loadReviewData(jobId: number) {
  const job = getApplication(jobId)
  const state = getCandidateAnalysisState(jobId)
  const requirements = job?.jobPostingAnalysis ? listJobRequirements(job.jobPostingAnalysis.id) : []
  return {
    job,
    run: state.latest,
    state,
    requirements,
    profiles: listProfiles(),
  }
}
