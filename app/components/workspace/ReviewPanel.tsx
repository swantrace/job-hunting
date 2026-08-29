import type { ApplicationAnalysisRun } from '../../../src/db/analysis'
import type { JobRequirement } from '../../../src/db/job-analysis'
import type { Filters, JobCardData } from '../../../src/db/queries'
import type { ApplicationSkillRequirement } from '../../../src/db/skill-queries'
import type { ProfileOption } from '../../../src/lib/profiles'
import { AnalysisRunStatus } from './AnalysisRunStatus'
import { FitRecommendation } from './FitRecommendation'
import { JobAnalysisSummary } from './JobAnalysisSummary'
import { ProfileRecommendation } from './ProfileRecommendation'
import { RequirementEvidenceMatrix } from './RequirementEvidenceMatrix'
import { SkillGapPanel } from './SkillGapPanel'

export function ReviewPanel({
  job,
  filters,
  requirements,
  careerEvidence,
  analysisRun,
  jobRequirements,
  profiles,
}: {
  job: JobCardData
  filters: Filters
  requirements: ApplicationSkillRequirement[]
  careerEvidence: Record<string, string[]>
  analysisRun: ApplicationAnalysisRun | null
  jobRequirements: JobRequirement[]
  profiles: ProfileOption[]
}) {
  const hasReviewedAnalysis = !!job.jobPostingAnalysis?.schemaVersion
  const pendingCount = requirements.filter(
    (item) => item.analysisResult === 'not-in-career-data' && item.userDecision === 'pending',
  ).length
  return (
    <div class="space-y-4">
      <AnalysisRunStatus
        jobId={job.id}
        filters={filters}
        run={analysisRun}
        hasReviewedAnalysis={hasReviewedAnalysis}
      />
      <JobAnalysisSummary job={job} />
      <FitRecommendation run={analysisRun} />
      <ProfileRecommendation
        jobId={job.id}
        filters={filters}
        run={analysisRun}
        profiles={profiles}
      />
      <RequirementEvidenceMatrix run={analysisRun} requirements={jobRequirements} />
      <SkillGapPanel
        job={job}
        filters={filters}
        requirements={requirements}
        careerEvidence={careerEvidence}
      />
      <section id="requirement-readiness" class="rounded-box border border-base-300 p-4">
        <h3 class="font-semibold">Document readiness</h3>
        {!hasReviewedAnalysis ? (
          <p class="mt-2 text-sm text-base-content/60">
            Analyze this application first before generating documents.
          </p>
        ) : !analysisRun || analysisRun.status !== 'Completed' ? (
          <p class="mt-2 text-sm text-base-content/60">
            Run candidate analysis and confirm a profile before generating documents.
          </p>
        ) : pendingCount > 0 ? (
          <p class="mt-2 text-sm text-base-content/60">
            {pendingCount} skill decision{pendingCount === 1 ? '' : 's'} still pending.
          </p>
        ) : (
          <p class="mt-2 text-sm">
            <span class="badge badge-success">Ready</span> for document generation.
          </p>
        )}
      </section>
    </div>
  )
}
