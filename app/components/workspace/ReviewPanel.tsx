import type { JobRequirement } from '../../../src/db/job-analysis'
import type { Filters, JobCardData } from '../../../src/db/queries'
import type { AnalysisMappingData } from '../../../src/db/skill-mapping-service'
import type { RunSkillReview } from '../../../src/db/skill-queries'
import type { ApplicationReadiness } from '../../../src/lib/applications/readiness'
import type { CandidateAnalysisState } from '../../../src/lib/candidate/analysis'
import { skillCategoryDefinitions } from '../../../src/lib/skills/taxonomy'
import { AnalysisRunStatus } from './AnalysisRunStatus'
import { FitRecommendation } from './FitRecommendation'
import { JobAnalysisSummary } from './JobAnalysisSummary'
import { RequirementEvidenceMatrix } from './RequirementEvidenceMatrix'
import { ReviewReadiness } from './ReviewReadiness'
import { SkillReviewPanel } from './SkillReviewPanel'

export function ReviewPanel({
  job,
  filters,
  requirements,
  careerEvidence,
  state,
  jobRequirements,
  readiness,
  jobAnalysis,
  jobAnalysisCurrent,
  mapping,
}: {
  job: JobCardData
  filters: Filters
  requirements: RunSkillReview[]
  careerEvidence: Record<string, string[]>
  state: CandidateAnalysisState
  jobRequirements: JobRequirement[]
  readiness: ApplicationReadiness
  jobAnalysis: import('../../../src/db/job-analysis-runs').JobAnalysisRun | null
  jobAnalysisCurrent: boolean
  mapping: AnalysisMappingData
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
      <RequirementEvidenceMatrix run={displayRun} requirements={jobRequirements} />
      <SkillReviewPanel
        job={job}
        filters={filters}
        requirements={requirements}
        careerEvidence={careerEvidence}
        mapping={mapping}
        categories={skillCategoryDefinitions()}
        canMap={jobAnalysisCurrent}
        canDecide={canAct}
      />
      <ReviewReadiness jobId={job.id} filters={filters} readiness={readiness} />
    </div>
  )
}
