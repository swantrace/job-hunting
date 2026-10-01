import { createRoute } from 'honox/factory'
import { getGenerationState, listGenerationRuns } from '../../../../src/db/generation'
import { getApplicationReadiness } from '../../../../src/lib/application-readiness'
import { enqueueGeneration } from '../../../../src/lib/generation-queue'
import { getGoogleDriveConnectionStatus } from '../../../../src/lib/google-drive'
import { parseFilters, parseId } from '../../../../src/lib/request'
import { GenerationPanel } from '../../../components/Workspace'

export const POST = createRoute(async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return c.html(<div class="alert alert-error">Application not found.</div>, 404)
  const readiness = getApplicationReadiness(id)
  const state = getGenerationState(id)
  if (!readiness.ready)
    return c.html(
      <GenerationPanel
        jobId={id}
        filters={parseFilters(c)}
        runs={listGenerationRuns(id)}
        googleDriveStatus={await getGoogleDriveConnectionStatus()}
        readiness={readiness}
        state={state}
      />,
      422,
    )
  try {
    const run = await enqueueGeneration(id)
    if (!run) return c.html(<div class="alert alert-error">Application not found.</div>, 404)
  } catch (error) {
    console.error('Unable to enqueue document generation', error)
  }
  return c.html(
    <GenerationPanel
      jobId={id}
      filters={parseFilters(c)}
      runs={listGenerationRuns(id)}
      googleDriveStatus={await getGoogleDriveConnectionStatus()}
      readiness={readiness}
      state={getGenerationState(id)}
    />,
  )
})

export const GET = createRoute(async (c) => {
  const id = parseId(c.req.param('id'))
  if (!id) return c.html(<div class="alert alert-error">Application not found.</div>, 404)
  return c.html(
    <GenerationPanel
      jobId={id}
      filters={parseFilters(c)}
      runs={listGenerationRuns(id)}
      googleDriveStatus={await getGoogleDriveConnectionStatus()}
      readiness={getApplicationReadiness(id)}
      state={getGenerationState(id)}
    />,
  )
})
