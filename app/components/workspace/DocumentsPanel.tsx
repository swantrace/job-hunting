import { listDocumentReviews } from '../../../src/db/document-review'
import type { GenerationRunWithArtifacts, GenerationState } from '../../../src/db/generation'
import type { Filters } from '../../../src/db/queries'
import type { ApplicationReadiness } from '../../../src/lib/application-readiness'
import { DocumentReviewPanel } from './DocumentReview'
import { GenerationPanel } from './GenerationPanel'

export function DocumentsPanel({
  jobId,
  filters,
  runs,
  evidenceSnapshot,
  googleDriveConnected,
  readiness = { ready: true, reasons: [] },
  state,
  active = false,
}: {
  jobId: number
  filters: Filters
  runs: GenerationRunWithArtifacts[]
  evidenceSnapshot: string | null
  googleDriveConnected: boolean
  readiness?: ApplicationReadiness
  state?: GenerationState
  active?: boolean
}) {
  const latestRun = state?.latestCompleted ?? runs[0] ?? null
  return (
    <div
      id="workspace-documents-panel"
      role="tabpanel"
      aria-labelledby="workspace-tab-documents"
      data-workspace-panel
      class={active ? '' : 'hidden'}
    >
      <GenerationPanel
        jobId={jobId}
        filters={filters}
        runs={runs}
        evidenceSnapshot={evidenceSnapshot}
        googleDriveConnected={googleDriveConnected}
        readiness={readiness}
        state={state}
      />
      {latestRun?.status === 'Completed' ? (
        <div class="mt-4">
          <DocumentReviewPanel
            jobId={jobId}
            runId={latestRun.id}
            filters={filters}
            review={listDocumentReviews(latestRun.id)[0] ?? null}
            canReview
          />
        </div>
      ) : null}
    </div>
  )
}
