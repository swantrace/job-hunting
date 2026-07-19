import { createRoute } from 'honox/factory'
import {
  getGenerationEvidenceSnapshot,
  getGoogleDriveConnection,
  listGenerationRuns,
} from '../../../../src/db/generation'
import { enqueueGeneration } from '../../../../src/lib/generation-queue'
import { parseFilters, parseId } from '../../../../src/lib/request'
import { GenerationPanel } from '../../../components/Workspace'

export const POST = createRoute(async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return c.html(<div class="alert alert-error">Application not found.</div>, 404)
  try {
    const run = await enqueueGeneration(id)
    if (!run) return c.html(<div class="alert alert-error">Application not found.</div>, 404)
  } catch (error) {
    console.error('Unable to enqueue document generation', error)
  }
  const runs = listGenerationRuns(id)
  return c.html(
    <GenerationPanel
      jobId={id}
      filters={parseFilters(c)}
      runs={runs}
      evidenceSnapshot={
        runs[0] ? (getGenerationEvidenceSnapshot(runs[0].id)?.snapshotJson ?? null) : null
      }
      googleDriveConnected={!!getGoogleDriveConnection()}
    />,
  )
})

export const GET = createRoute((c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return c.html(<div class="alert alert-error">Application not found.</div>, 404)
  const runs = listGenerationRuns(id)
  return c.html(
    <GenerationPanel
      jobId={id}
      filters={parseFilters(c)}
      runs={runs}
      evidenceSnapshot={
        runs[0] ? (getGenerationEvidenceSnapshot(runs[0].id)?.snapshotJson ?? null) : null
      }
      googleDriveConnected={!!getGoogleDriveConnection()}
    />,
  )
})
