import type { GenerationRunWithArtifacts } from '../../../src/db/generation'
import type { Filters } from '../../../src/db/queries'
import type { ApplicationReadiness } from '../../../src/lib/application-readiness'
import { GenerationPanel } from './GenerationPanel'

export function DocumentsPanel({
  jobId,
  filters,
  runs,
  evidenceSnapshot,
  googleDriveConnected,
  readiness = { ready: true, reasons: [] },
  active = false,
}: {
  jobId: number
  filters: Filters
  runs: GenerationRunWithArtifacts[]
  evidenceSnapshot: string | null
  googleDriveConnected: boolean
  readiness?: ApplicationReadiness
  active?: boolean
}) {
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
      />
    </div>
  )
}
