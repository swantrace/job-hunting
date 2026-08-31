import { hasPendingRunDecisions } from '../db/analysis-decisions'
import { db } from '../db/client'
import { getJobAnalysisState } from '../db/job-analysis-runs'
import { getApplication } from '../db/queries'
import { getCandidateAnalysisState } from './candidate-analysis'
import { currentJobAnalysisHash } from './job-analysis-input'

export type AnalysisReadinessStatus =
  | 'none'
  | 'queued'
  | 'processing'
  | 'failed'
  | 'completed'
  | 'stale'

export type ApplicationReadiness = {
  ready: boolean
  reasons: string[]
}

export type ApplicationReadinessInput = {
  hasReviewedAnalysis: boolean
  analysisStatus: AnalysisReadinessStatus
  profileConfirmed: boolean
  hasPendingSkillDecisions: boolean
}

/**
 * The single authoritative readiness rule for application-specific document
 * generation. Returns a structured reason list so the UI can display actionable
 * blockers instead of a bare boolean. Direction-only baseline generation is
 * intentionally independent of these conditions.
 */
export function assessApplicationReadiness(input: ApplicationReadinessInput): ApplicationReadiness {
  const reasons: string[] = []
  if (!input.hasReviewedAnalysis) reasons.push('Analyze this application first.')
  else if (
    input.analysisStatus === 'none' ||
    input.analysisStatus === 'queued' ||
    input.analysisStatus === 'processing' ||
    input.analysisStatus === 'failed'
  )
    reasons.push('Run candidate analysis to completion first.')
  if (input.analysisStatus === 'stale')
    reasons.push('Candidate analysis is stale — re-run it before generating documents.')
  if (!input.profileConfirmed) reasons.push('Confirm a generation profile first.')
  if (input.hasPendingSkillDecisions)
    reasons.push('Resolve every missing-skill decision before generating documents.')
  return { ready: reasons.length === 0, reasons }
}

export function getApplicationReadiness(jobId: number): ApplicationReadiness {
  const job = getApplication(jobId)
  const state = getCandidateAnalysisState(jobId)
  const run = state.latest
  const current = state.currentCompleted
  const jobState = job?.jobPosting
    ? getJobAnalysisState(db, job.jobPosting.id, currentJobAnalysisHash(db, job.jobPosting.id))
    : null
  const hasReviewedAnalysis = !!jobState?.currentCompleted

  let analysisStatus: AnalysisReadinessStatus = 'none'
  if (run) {
    if (run.status === 'Queued') analysisStatus = 'queued'
    else if (run.status === 'Processing') analysisStatus = 'processing'
    else if (run.status === 'Failed') analysisStatus = 'failed'
    else if (run.status === 'Completed') analysisStatus = current ? 'completed' : 'stale'
  }

  return assessApplicationReadiness({
    hasReviewedAnalysis,
    analysisStatus,
    profileConfirmed: !!current?.confirmedProfileId,
    hasPendingSkillDecisions: current ? hasPendingRunDecisions(db, current.id) : true,
  })
}
