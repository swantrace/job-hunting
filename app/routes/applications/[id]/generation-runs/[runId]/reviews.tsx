import { createRoute } from 'honox/factory'
import { listDocumentReviews } from '../../../../../../src/db/document-review'
import { getGenerationRunResults } from '../../../../../../src/db/generation'
import { enqueueDocumentReview } from '../../../../../../src/lib/document-review-queue'
import { parseFilters, parseId } from '../../../../../../src/lib/request'
import { DocumentReviewPanel } from '../../../../../components/workspace/DocumentReview'

function panelFor(jobId: number, runId: number, filters: ReturnType<typeof parseFilters>) {
  const review = listDocumentReviews(runId)[0] ?? null
  const results = getGenerationRunResults(runId)
  return (
    <DocumentReviewPanel
      jobId={jobId}
      runId={runId}
      filters={filters}
      review={review}
      canReview={!!results?.resumeJson && !!results?.coverLetterJson}
    />
  )
}

export const POST = createRoute(async (c) => {
  const jobId = parseId(c.req.param('id'))
  const runId = parseId(c.req.param('runId'))
  const filters = parseFilters(c)
  if (!jobId || !runId) return c.html(<div class="alert alert-error">Not found.</div>, 404)
  const result = await enqueueDocumentReview(runId)
  if (result.reason === 'missing-results') {
    c.header('HX-Retarget', '#document-review')
    return c.html(panelFor(jobId, runId, filters), 422)
  }
  return c.html(panelFor(jobId, runId, filters))
})

export const GET = createRoute((c) => {
  const jobId = parseId(c.req.param('id'))
  const runId = parseId(c.req.param('runId'))
  const filters = parseFilters(c)
  if (!jobId || !runId) return c.html(<div class="alert alert-error">Not found.</div>, 404)
  return c.html(panelFor(jobId, runId, filters))
})
