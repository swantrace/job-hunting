import {
  getGenerationEvidenceSnapshot,
  getGoogleDriveConnection,
  listGenerationRuns,
} from '../../../src/db/generation'
import type { Filters, JobCardData } from '../../../src/db/queries'
import type { FieldErrors, WorkspaceTab } from '../../../src/lib/validation'
import { ActivityPanel } from './ActivityPanel'
import { ApplicationPanel } from './ApplicationPanel'
import { ContactsPanel } from './ContactsPanel'
import { DocumentsPanel } from './DocumentsPanel'
import { type WorkspaceErrorForm } from './helpers'
import { WorkspaceHeader } from './WorkspaceHeader'
import { WorkspaceTabs } from './WorkspaceTabs'

export function WorkspaceShell({
  job,
  filters,
  activity,
  activeTab = 'application',
  errors,
  errorForm,
}: {
  job: JobCardData
  filters: Filters
  activity: ReturnType<typeof import('../../../src/db/queries').getActivity>
  activeTab?: WorkspaceTab
  errors?: FieldErrors
  errorForm?: WorkspaceErrorForm
}) {
  const generationRuns = listGenerationRuns(job.id)
  const latestEvidenceSnapshot = generationRuns[0]
    ? getGenerationEvidenceSnapshot(generationRuns[0].id)
    : null
  const googleDriveConnected = !!getGoogleDriveConnection()
  return (
    <div id="workspace-shell">
      <WorkspaceHeader job={job} />
      <WorkspaceTabs activeTab={activeTab} />
      <div
        id="workspace-application-panel"
        role="tabpanel"
        aria-labelledby="workspace-tab-application"
        data-workspace-panel
        class={activeTab !== 'application' ? 'hidden' : ''}
      >
        <ApplicationPanel job={job} filters={filters} />
      </div>
      <div
        id="workspace-contacts-panel"
        role="tabpanel"
        aria-labelledby="workspace-tab-contacts"
        data-workspace-panel
        class={activeTab !== 'contacts' ? 'hidden' : ''}
      >
        <ContactsPanel
          job={job}
          filters={filters}
          errors={errorForm === 'contact' ? errors : undefined}
        />
      </div>
      <div
        id="workspace-activity-panel"
        role="tabpanel"
        aria-labelledby="workspace-tab-activity"
        data-workspace-panel
        class={activeTab !== 'activity' ? 'hidden' : ''}
      >
        <ActivityPanel
          job={job}
          filters={filters}
          activity={activity}
          errors={errors}
          errorForm={errorForm}
        />
      </div>
      <div
        id="workspace-documents-panel"
        role="tabpanel"
        aria-labelledby="workspace-tab-documents"
        data-workspace-panel
        class={activeTab !== 'documents' ? 'hidden' : ''}
      >
        <DocumentsPanel
          jobId={job.id}
          filters={filters}
          runs={generationRuns}
          evidenceSnapshot={latestEvidenceSnapshot?.snapshotJson ?? null}
          googleDriveConnected={googleDriveConnected}
        />
      </div>
    </div>
  )
}
