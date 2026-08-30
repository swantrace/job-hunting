import { createRoute } from 'honox/factory'
import { db } from '../../../../src/db/client'
import { updateJobPostingRawText } from '../../../../src/db/job-analysis-runs'
import { getApplication } from '../../../../src/db/queries'
import { parseFilters, parseId } from '../../../../src/lib/request'
import { ApplicationPanel } from '../../../components/workspace/ApplicationPanel'

export const POST = createRoute(async (c) => {
  const id = parseId(c.req.param('id'))
  const filters = parseFilters(c)
  const job = id ? getApplication(id) : null
  if (!id || !job) return c.html(<div class="alert alert-error">Application not found.</div>, 404)

  const form = await c.req.formData()
  const rawText = String(form.get('rawText') ?? '').trim()
  if (rawText.length < 20) {
    c.header('HX-Retarget', '#workspace-application-panel')
    return c.html(<ApplicationPanel job={job} filters={filters} active />, 422)
  }
  if (job.jobPosting) updateJobPostingRawText(db, job.jobPosting.id, rawText)
  return c.html(<ApplicationPanel job={getApplication(id)!} filters={filters} active />)
})
