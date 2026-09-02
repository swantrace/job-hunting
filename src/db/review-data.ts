import { getCandidateAnalysisState } from '../lib/candidate-analysis'
import { currentJobAnalysisHash } from '../lib/job-analysis-input'
import { db } from './client'
import { listJobRequirements } from './job-analysis'
import { getJobAnalysisState } from './job-analysis-runs'
import { getApplication } from './queries'
import { listRunSkillReviews } from './skill-queries'

/**
 * Single loader for the review workspace. Returns the full candidate-analysis
 * state, normalized job requirements from the current Job Analysis run, and
 * run-scoped skill reviews so the ReviewPanel and the analysis-runs fragment
 * route render the same data.
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
    jobAnalysis,
    jobAnalysisCurrent: !!jobState?.currentCompleted,
    run: state.latest,
    state,
    requirements,
    requirementSkills,
  }
}
