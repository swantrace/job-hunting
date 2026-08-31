import type { JobRequirement } from '../../../src/db/job-analysis'
import type { Filters, JobCardData } from '../../../src/db/queries'
import type { RunSkillReview } from '../../../src/db/skill-queries'
import type { ApplicationReadiness } from '../../../src/lib/application-readiness'
import type { CandidateAnalysisState } from '../../../src/lib/candidate-analysis'
import type { ProfileOption } from '../../../src/lib/profiles'
import { AnalysisRunStatus } from './AnalysisRunStatus'
import { FitRecommendation } from './FitRecommendation'
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
  jobAnalysis,
  jobAnalysisCurrent,
}: {
  job: JobCardData
  filters: Filters
  requirements: RunSkillReview[]
  careerEvidence: Record<string, string[]>
  state: CandidateAnalysisState
  jobRequirements: JobRequirement[]
  profiles: ProfileOption[]
  readiness: ApplicationReadiness
  jobAnalysis: import('../../../src/db/job-analysis-runs').JobAnalysisRun | null
  jobAnalysisCurrent: boolean
}) {
  const displayRun = state.latestCompleted
  const canAct = state.state === 'current' && !!state.currentCompleted

  return (
    <div class="space-y-4">
      <AnalysisRunStatus
        jobId={job.id}
        filters={filters}
        run={state.latest}
        hasCurrentJobAnalysis={jobAnalysisCurrent}
      />
      <JobAnalysisSummary analysis={jobAnalysis} />
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
