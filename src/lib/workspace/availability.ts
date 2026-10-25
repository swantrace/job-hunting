import { db } from '../../db/client'
import { getGenerationState } from '../../db/generation'
import { getJobAnalysisState } from '../../db/job-analysis-runs'
import { getApplication } from '../../db/queries'
import { careerOnboardingRequired, getApplicationReadiness } from '../applications/readiness'
import { getCandidateAnalysisState } from '../candidate/analysis'
import { currentJobAnalysisHash } from '../job-analysis/input'
import type { WorkspaceAvailability } from './state'

/**
 * Computes the current workspace progression state from live run history and
 * the database-owned career facts. Current inputs are compared lazily here so
 * career changes are detected on every workspace/readiness load, and an empty
 * career database reports onboarding rather than throwing.
 */
export function computeWorkspaceAvailability(jobId: number): WorkspaceAvailability {
  const job = getApplication(jobId)
  const jobState = job?.jobPosting
    ? getJobAnalysisState(db, job.jobPosting.id, currentJobAnalysisHash(db, job.jobPosting.id))
    : null
  const candidateState = getCandidateAnalysisState(jobId)
  const generationState = getGenerationState(jobId)
  return {
    careerDataReady: !careerOnboardingRequired(),
    jobAnalysisCurrent: !!jobState?.currentCompleted,
    // Navigation and generation must use the same effective decisions. Raw
    // pending rows can belong to skills that are already proven by career data.
    reviewReady: getApplicationReadiness(jobId).ready,
    hasHistoricalReview: candidateState.latestCompleted !== null,
    hasHistoricalDocuments: generationState.latestCompleted !== null,
  }
}
