import { createRoute } from 'honox/factory'
import { getApplication } from '../../../../src/db/queries'
import { enqueueJobAnalysis } from '../../../../src/lib/job-analysis-queue'
import { parseFilters, parseId } from '../../../../src/lib/request'
import { computeWorkspaceAvailability } from '../../../../src/lib/workspace/availability'
import { resolveWorkspaceTab, tabAvailability } from '../../../../src/lib/workspace/state'
import { JobAnalysisStatus } from '../../../components/workspace/JobAnalysisStatus'
import { WorkspaceTabs } from '../../../components/workspace/WorkspaceTabs'

function statusFragment(jobId: number, filters: ReturnType<typeof parseFilters>) {
  const job = getApplication(jobId)
  if (!job) return <div class="alert alert-error">Application not found.</div>
  const availabilityState = computeWorkspaceAvailability(jobId)
  return (
    <>
      <JobAnalysisStatus job={job} filters={filters} />
      <WorkspaceTabs
        activeTab={resolveWorkspaceTab('application', availabilityState)}
        availability={tabAvailability(availabilityState)}
        oob
      />
    </>
  )
}

export const GET = createRoute((c) => {
  const id = parseId(c.req.param('id'))
  const filters = parseFilters(c)
  if (!id) return c.html(<div class="alert alert-error">Application not found.</div>, 404)
  return c.html(statusFragment(id, filters))
})

export const POST = createRoute(async (c) => {
  const id = parseId(c.req.param('id'))
  const filters = parseFilters(c)
  if (!id) return c.html(<div class="alert alert-error">Application not found.</div>, 404)
  const job = getApplication(id)
  if (!job?.jobPosting) {
    c.header('HX-Retarget', '#workspace-job-analysis-status')
    return c.html(statusFragment(id, filters), 422)
  }
  const result = await enqueueJobAnalysis(job.jobPosting.id)
  if (result.reason === 'missing-posting') {
    c.header('HX-Retarget', '#workspace-job-analysis-status')
    return c.html(statusFragment(id, filters), 422)
  }
  return c.html(statusFragment(id, filters))
})
