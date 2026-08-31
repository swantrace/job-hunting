import { hasPendingRunDecisions } from '../../db/analysis-decisions'
import { db } from '../../db/client'
import { getGenerationState } from '../../db/generation'
import { getJobAnalysisState } from '../../db/job-analysis-runs'
import { getApplication } from '../../db/queries'
import { getResumeStrategy } from '../../db/resume-strategy'
import { getCandidateAnalysisState } from '../candidate-analysis'
import { currentJobAnalysisHash } from '../job-analysis-input'
import type { WorkspaceAvailability } from './state'

/**
 * Computes the current workspace progression state from live run history.
 * Current inputs are compared lazily here so career-data/profile file updates
 * are detected on every workspace/readiness load.
 */
export function computeWorkspaceAvailability(jobId: number): WorkspaceAvailability {
  const job = getApplication(jobId)
  const jobState = job?.jobPosting
    ? getJobAnalysisState(db, job.jobPosting.id, currentJobAnalysisHash(db, job.jobPosting.id))
    : null
  const candidateState = getCandidateAnalysisState(jobId)
  const generationState = getGenerationState(jobId)
  const current = candidateState.currentCompleted
  const reviewReady =
    !!current &&
    !!current.confirmedProfileId &&
    !hasPendingRunDecisions(db, current.id) &&
    !!getResumeStrategy(current.id)
  return {
    jobAnalysisCurrent: !!jobState?.currentCompleted,
    reviewReady,
    hasHistoricalReview: candidateState.latestCompleted !== null,
    hasHistoricalDocuments: generationState.latestCompleted !== null,
  }
}
