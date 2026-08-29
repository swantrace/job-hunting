import { listProfiles } from '../lib/profiles'
import { listAnalysisRuns } from './analysis'
import { listJobRequirements } from './job-analysis'
import { getApplication } from './queries'

/**
 * Single loader for the review workspace. Returns the latest analysis run,
 * normalized job requirements, and available profiles so the ReviewPanel and
 * the analysis-runs fragment route render the same authoritative data.
 */
export function loadReviewData(jobId: number) {
  const job = getApplication(jobId)
  const run = listAnalysisRuns(jobId)[0] ?? null
  const requirements = job?.jobPostingAnalysis ? listJobRequirements(job.jobPostingAnalysis.id) : []
  return {
    job,
    run,
    requirements,
    profiles: listProfiles(),
  }
}
