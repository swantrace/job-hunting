import { createRoute } from 'honox/factory'
import {
  confirmProfileSelection,
  getAnalysisRun,
  listAnalysisRuns,
} from '../../../../src/db/analysis'
import { getApplication } from '../../../../src/db/queries'
import { currentCandidateAnalysisHash } from '../../../../src/lib/candidate-analysis'
import { listProfiles } from '../../../../src/lib/profiles'
import { parseFilters, parseForm, parseId } from '../../../../src/lib/request'
import { profileSelectionSchema } from '../../../../src/lib/validation'
import { ProfileRecommendation } from '../../../components/workspace/ProfileRecommendation'

function recommendationFor(jobId: number, filters: ReturnType<typeof parseFilters>) {
  const run = listAnalysisRuns(jobId)[0] ?? null
  return (
    <ProfileRecommendation jobId={jobId} filters={filters} run={run} profiles={listProfiles()} />
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
  if (!run || run.jobApplicationId !== id) {
    c.header('HX-Retarget', '#profile-recommendation')
    return c.html(recommendationFor(id, filters), 422)
  }
  if (run.status !== 'Completed') {
    c.header('HX-Retarget', '#profile-recommendation')
    return c.html(recommendationFor(id, filters), 422)
  }
  const currentHash = currentCandidateAnalysisHash(id)
  if (currentHash && run.inputHash !== currentHash) {
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
