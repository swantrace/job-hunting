import { createRoute } from 'honox/factory'
import {
  advanceBatchAnalyses,
  createAnalysisBatch,
  listBatchAnalysisItems,
} from '../../../src/lib/analysis/batch'
import { batchAnalysisRequestSchema } from '../../../src/lib/analysis/batch-contract'
import { BatchAnalysisStatus } from '../../components/applications/BatchAnalysisStatus'

export const POST = createRoute(async (c) => {
  const form = await c.req.formData()
  const parsed = batchAnalysisRequestSchema.safeParse({
    mode: form.get('mode'),
    applicationIds: [...new Set(form.getAll('applicationIds'))],
  })
  if (!parsed.success)
    return c.html(
      <BatchAnalysisStatus error="Select between 1 and 200 applications and a valid analysis mode." />,
      422,
    )
  const batchId = createAnalysisBatch(parsed.data)
  void advanceBatchAnalyses().catch((error) =>
    console.error('Batch dispatch deferred to recovery', error),
  )
  return c.html(<BatchAnalysisStatus batchId={batchId} />)
})

export const GET = createRoute((c) => {
  const batchId = c.req.query('batchId')
  if (!batchId || !listBatchAnalysisItems(batchId).length)
    return c.html(<BatchAnalysisStatus error="Batch not found." />, 404)
  return c.html(<BatchAnalysisStatus batchId={batchId} />)
})
