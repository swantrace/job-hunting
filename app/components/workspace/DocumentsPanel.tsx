import type { GenerationRunWithArtifacts } from '../../../src/db/generation'
import type { Filters } from '../../../src/db/queries'
import { GenerationPanel } from './GenerationPanel'

export function DocumentsPanel({
  jobId,
  filters,
  runs,
  evidenceSnapshot,
  googleDriveConnected,
  generationReady = true,
  active = false,
}: {
  jobId: number
  filters: Filters
  runs: GenerationRunWithArtifacts[]
  evidenceSnapshot: string | null
  googleDriveConnected: boolean
  generationReady?: boolean
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
        generationReady={generationReady}
      />
    </div>
  )
}
