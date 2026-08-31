import {
  getGenerationEvidenceSnapshot,
  getGenerationState,
  getGoogleDriveConnection,
  listGenerationRuns,
} from '../../../src/db/generation'
import type { Filters, JobCardData } from '../../../src/db/queries'
import { loadReviewData } from '../../../src/db/review-data'
import { getApplicationReadiness } from '../../../src/lib/application-readiness'
import type { FieldErrors } from '../../../src/lib/validation'
import type { WorkspaceTab } from '../../../src/lib/workspace/constants'
import type { TabAvailability } from '../../../src/lib/workspace/state'
import { ActivityPanel } from './ActivityPanel'
import { ApplicationPanel } from './ApplicationPanel'
import { ContactsPanel } from './ContactsPanel'
import { DocumentsPanel } from './DocumentsPanel'
import { type WorkspaceErrorForm } from './helpers'
import { ReviewPanel } from './ReviewPanel'
import { WorkspaceHeader } from './WorkspaceHeader'
import { WorkspaceTabs } from './WorkspaceTabs'

export function WorkspaceShell({
  job,
  filters,
  activity,
  careerEvidence = {},
  activeTab = 'application',
  availability,
  errors,
  errorForm,
}: {
  job: JobCardData
  filters: Filters
  activity: ReturnType<typeof import('../../../src/db/queries').getActivity>
  careerEvidence?: Record<string, string[]>
  activeTab?: WorkspaceTab
  availability: TabAvailability[]
  errors?: FieldErrors
  errorForm?: WorkspaceErrorForm
}) {
  const generationRuns = listGenerationRuns(job.id)
  const generationState = getGenerationState(job.id)
  const latestEvidenceSnapshot = generationRuns[0]
    ? getGenerationEvidenceSnapshot(generationRuns[0].id)
    : null
  const googleDriveConnected = !!getGoogleDriveConnection()
  const review = loadReviewData(job.id)
  const readiness = getApplicationReadiness(job.id)
  return (
    <div id="workspace-shell">
      <WorkspaceHeader job={job} />
      <WorkspaceTabs activeTab={activeTab} availability={availability} />
      <ApplicationPanel job={job} filters={filters} active={activeTab === 'application'} />
      <ContactsPanel
        job={job}
        filters={filters}
        errors={errorForm === 'contact' ? errors : undefined}
        active={activeTab === 'contacts'}
      />
      <ActivityPanel
        job={job}
        filters={filters}
        activity={activity}
        errors={errors}
        errorForm={errorForm}
        active={activeTab === 'activity'}
      />
      <DocumentsPanel
        jobId={job.id}
        filters={filters}
        runs={generationRuns}
        evidenceSnapshot={latestEvidenceSnapshot?.snapshotJson ?? null}
        googleDriveConnected={googleDriveConnected}
        readiness={readiness}
        state={generationState}
        active={activeTab === 'documents'}
      />
      <div
        id="workspace-review-panel"
        role="tabpanel"
        aria-labelledby="workspace-tab-review"
        data-workspace-panel
        class={activeTab === 'review' ? '' : 'hidden'}
      >
        <ReviewPanel
          job={job}
          filters={filters}
          requirements={review.requirementSkills}
          careerEvidence={careerEvidence}
          state={review.state}
          jobRequirements={review.requirements}
          profiles={review.profiles}
          readiness={readiness}
          jobAnalysis={review.jobAnalysis}
          jobAnalysisCurrent={review.jobAnalysisCurrent}
        />
      </div>
    </div>
  )
}
