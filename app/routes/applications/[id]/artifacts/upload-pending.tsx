import { createRoute } from 'honox/factory'
import {
  getGenerationState,
  listGenerationRuns,
  markArtifactUploadFailed,
} from '../../../../../src/db/generation'
import { getApplication } from '../../../../../src/db/queries'
import { getApplicationReadiness } from '../../../../../src/lib/application-readiness'
import {
  getGoogleDriveConnectionStatus,
  uploadArtifactToGoogleDrive,
} from '../../../../../src/lib/google-drive'
import { parseFilters, parseId } from '../../../../../src/lib/request'
import { GenerationPanel } from '../../../../components/Workspace'

function panelFor(
  id: number,
  filters: ReturnType<typeof parseFilters>,
  googleDriveStatus: Awaited<ReturnType<typeof getGoogleDriveConnectionStatus>>,
  uploadSummary?: { uploaded: number; failed: number },
) {
  return (
    <GenerationPanel
      jobId={id}
      filters={filters}
      runs={listGenerationRuns(id)}
      googleDriveStatus={googleDriveStatus}
      readiness={getApplicationReadiness(id)}
      state={getGenerationState(id)}
      uploadSummary={uploadSummary}
    />
  )
}

export const POST = createRoute(async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id || !getApplication(id))
    return c.html(<div class="alert alert-error">Application not found.</div>, 404)
  const filters = parseFilters(c)
  const initialStatus = await getGoogleDriveConnectionStatus(true)
  if (initialStatus.state !== 'connected') return c.html(panelFor(id, filters, initialStatus), 422)

  let uploaded = 0
  let failed = 0
  const pending = listGenerationRuns(id)
    .flatMap((run) => run.artifacts)
    .filter((artifact) => !artifact.googleDriveFileId)

  for (const artifact of pending) {
    try {
      await uploadArtifactToGoogleDrive(artifact)
      uploaded += 1
    } catch (error) {
      markArtifactUploadFailed(artifact.id, error)
      failed += 1
    }
  }

  return c.html(panelFor(id, filters, await getGoogleDriveConnectionStatus(), { uploaded, failed }))
})
