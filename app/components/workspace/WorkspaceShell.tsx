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
        active={activeTab === 'documents'}
      />
    </div>
  )
}
