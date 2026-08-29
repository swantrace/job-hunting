import { createRoute } from 'honox/factory'
import { listAnalysisRuns } from '../../../../src/db/analysis'
import { getApplication } from '../../../../src/db/queries'
import { enqueueCandidateAnalysis } from '../../../../src/lib/analysis-queue'
import { parseFilters, parseId } from '../../../../src/lib/request'
import { AnalysisRunStatus } from '../../../components/workspace/AnalysisRunStatus'

function statusFor(jobId: number, filters: ReturnType<typeof parseFilters>) {
  const runs = listAnalysisRuns(jobId)
  return (
    <AnalysisRunStatus
      jobId={jobId}
      filters={filters}
      run={runs[0] ?? null}
      hasReviewedAnalysis={hasReviewedAnalysis(jobId)}
    />
  )
}

function hasReviewedAnalysis(jobId: number) {
  // A reviewed structured analysis always carries a schema version; legacy
  // line-based analyses and unparsed opportunities return false so the user is
  // directed to analyze the job first.
  return !!getApplication(jobId)?.jobPostingAnalysis?.schemaVersion
}

export const POST = createRoute(async (c) => {
  const id = parseId(c.req.param('id'))
  const filters = parseFilters(c)
  if (!id) return c.html(<div class="alert alert-error">Application not found.</div>, 404)
  const job = getApplication(id)
  if (!job) return c.html(<div class="alert alert-error">Application not found.</div>, 404)

  if (!hasReviewedAnalysis(id)) {
    c.header('HX-Retarget', '#analysis-run-status')
    return c.html(statusFor(id, filters), 422)
  }

  const result = await enqueueCandidateAnalysis(id)
  if (result.reason === 'missing-analysis') {
    c.header('HX-Retarget', '#analysis-run-status')
    return c.html(statusFor(id, filters), 422)
  }
  return c.html(statusFor(id, filters))
})

export const GET = createRoute((c) => {
  const id = parseId(c.req.param('id'))
  const filters = parseFilters(c)
  if (!id) return c.html(<div class="alert alert-error">Application not found.</div>, 404)
  return c.html(statusFor(id, filters))
})
