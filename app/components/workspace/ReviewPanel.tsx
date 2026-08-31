import type { JobRequirement } from '../../../src/db/job-analysis'
import type { Filters, JobCardData } from '../../../src/db/queries'
import type {
  ResumeStrategyContent,
  ResumeStrategy as ResumeStrategyRecord,
} from '../../../src/db/resume-strategy'
import type { RunSkillReview } from '../../../src/db/skill-queries'
import type { ApplicationReadiness } from '../../../src/lib/application-readiness'
import type { CandidateAnalysisState } from '../../../src/lib/candidate-analysis'
import type { ProfileOption } from '../../../src/lib/profiles'
import { AnalysisRunStatus } from './AnalysisRunStatus'
import { FitRecommendation } from './FitRecommendation'
import { JobAnalysisSummary } from './JobAnalysisSummary'
import { ProfileRecommendation } from './ProfileRecommendation'
import { RequirementEvidenceMatrix } from './RequirementEvidenceMatrix'
import { ResumeStrategy } from './ResumeStrategy'
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
  resumeStrategy,
  resumeStrategyDraft,
  resumeEvidenceAllowlist,
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
  resumeStrategy: ResumeStrategyRecord | null
  resumeStrategyDraft: ResumeStrategyContent | null
  resumeEvidenceAllowlist: string[]
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
      <ResumeStrategy
        jobId={job.id}
        filters={filters}
        run={state.currentCompleted}
        strategy={resumeStrategy}
        draft={resumeStrategyDraft}
        allowlist={resumeEvidenceAllowlist}
        canEdit={canAct && !!state.currentCompleted?.confirmedProfileId}
      />
      <ReviewReadiness jobId={job.id} filters={filters} readiness={readiness} />
    </div>
  )
}
