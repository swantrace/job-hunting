import { createRoute } from 'honox/factory'
import { confirmProfileSelection, getAnalysisRun } from '../../../../src/db/analysis'
import { getApplication } from '../../../../src/db/queries'
import { getCandidateAnalysisState } from '../../../../src/lib/candidate-analysis'
import { listProfiles } from '../../../../src/lib/profiles'
import { parseFilters, parseForm, parseId } from '../../../../src/lib/request'
import { profileSelectionSchema } from '../../../../src/lib/validation'
import { ProfileRecommendation } from '../../../components/workspace/ProfileRecommendation'

function recommendationFor(jobId: number, filters: ReturnType<typeof parseFilters>) {
  const state = getCandidateAnalysisState(jobId)
  return (
    <ProfileRecommendation
      jobId={jobId}
      filters={filters}
      run={state.latestCompleted}
      profiles={listProfiles()}
      canConfirm={state.state === 'current'}
    />
  )
}

export const POST = createRoute(async (c) => {
  const id = parseId(c.req.param('id'))
  const filters = parseFilters(c)
  if (!id) return c.html(<div class="alert alert-error">Application not found.</div>, 404)
  if (!getApplication(id))
    return c.html(<div class="alert alert-error">Application not found.</div>, 404)

  const raw = await parseForm(c)
  const parsed = profileSelectionSchema.safeParse(raw)
  if (!parsed.success) {
    c.header('HX-Retarget', '#profile-recommendation')
    return c.html(recommendationFor(id, filters), 422)
  }

  const run = getAnalysisRun(parsed.data.runId)
  if (!run || run.jobApplicationId !== id || run.status !== 'Completed') {
    c.header('HX-Retarget', '#profile-recommendation')
    return c.html(recommendationFor(id, filters), 422)
  }
  // Reject confirmation against an outdated/non-current run.
  const state = getCandidateAnalysisState(id)
  if (!state.currentCompleted || state.currentCompleted.id !== run.id) {
    c.header('HX-Retarget', '#profile-recommendation')
    return c.html(recommendationFor(id, filters), 422)
  }

  confirmProfileSelection(run.id, parsed.data.profileId)
  return c.html(recommendationFor(id, filters))
})

export const GET = createRoute((c) => {
  const id = parseId(c.req.param('id'))
  const filters = parseFilters(c)
  if (!id) return c.html(<div class="alert alert-error">Application not found.</div>, 404)
  return c.html(recommendationFor(id, filters))
})
