import type { ApplicationAnalysisRun } from '../../../src/db/analysis'
import type { JobRequirement } from '../../../src/db/job-analysis'
import type { Filters, JobCardData } from '../../../src/db/queries'
import type { RunSkillReview } from '../../../src/db/skill-queries'
import type { ApplicationReadiness } from '../../../src/lib/application-readiness'
import type { CandidateAnalysisState } from '../../../src/lib/candidate-analysis'
import type { ProfileOption } from '../../../src/lib/profiles'
import { reviewGateCopy } from '../../../src/lib/workspace/state'
import { AnalysisRunStatus } from './AnalysisRunStatus'
import { FitRecommendation } from './FitRecommendation'
import { query } from './helpers'
import { JobAnalysisSummary } from './JobAnalysisSummary'
import { ProfileRecommendation } from './ProfileRecommendation'
import { RequirementEvidenceMatrix } from './RequirementEvidenceMatrix'
import { ReviewReadiness } from './ReviewReadiness'
import { SkillGapPanel } from './SkillGapPanel'

export function ReviewPanel({
  job,
  filters,
  requirements,
  careerEvidence,
  state,
  jobRequirements,
  profiles,
  readiness,
}: {
  job: JobCardData
  filters: Filters
  requirements: RunSkillReview[]
  careerEvidence: Record<string, string[]>
  state: CandidateAnalysisState
  jobRequirements: JobRequirement[]
  profiles: ProfileOption[]
  readiness: ApplicationReadiness
}) {
  const copy = reviewGateCopy(state.state)
  const displayRun = state.latestCompleted
  const canAct = state.state === 'current' && !!state.currentCompleted

  return (
    <div class="space-y-4">
      <section class="rounded-box border border-base-300 p-4" aria-live="polite">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="font-semibold">{copy.heading}</h3>
            <p class="mt-1 text-sm text-base-content/60">{copy.message}</p>
            {state.reasons.length ? (
              <p class="mt-1 text-xs text-base-content/60">Reasons: {state.reasons.join(', ')}</p>
            ) : null}
          </div>
          {state.state !== 'current' && state.state !== 'queued' && state.state !== 'processing' ? (
            <form
              hx-post={`/applications/${job.id}/analysis-runs?${query(filters)}&workspaceTab=review`}
              hx-target="#analysis-run-status"
              hx-swap="outerHTML"
              hx-disabled-elt="find button"
            >
              <button class="btn btn-secondary btn-sm">{copy.actionLabel}</button>
            </form>
          ) : null}
        </div>
      </section>

      <AnalysisRunStatus
        jobId={job.id}
        filters={filters}
        run={state.latest}
        hasReviewedAnalysis={canAct || !!displayRun}
      />
      <JobAnalysisSummary job={job} />
      <FitRecommendation run={displayRun} />
      <ProfileRecommendation
        jobId={job.id}
        filters={filters}
        run={displayRun}
        profiles={profiles}
        canConfirm={canAct}
      />
      <RequirementEvidenceMatrix run={displayRun} requirements={jobRequirements} />
      <SkillGapPanel
        job={job}
        filters={filters}
        requirements={requirements}
        careerEvidence={careerEvidence}
        canDecide={canAct}
      />
      <ReviewReadiness jobId={job.id} filters={filters} readiness={readiness} />
    </div>
  )
}
