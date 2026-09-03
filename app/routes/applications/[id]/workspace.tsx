import { createRoute } from 'honox/factory'
import { getActivity, getApplication } from '../../../../src/db/queries'
import { careerSkillEvidenceMap } from '../../../../src/lib/career-data'
import { parseFilters, parseId, parseWorkspaceTab } from '../../../../src/lib/request'
import { computeWorkspaceAvailability } from '../../../../src/lib/workspace/availability'
import { resolveWorkspaceTab, tabAvailability } from '../../../../src/lib/workspace/state'
import { Workspace } from '../../../components/Workspace'
import { AppShell } from '../../../components/layout/AppShell'

export default createRoute((c) => {
  const id = parseId(c.req.param('id'))
  const job = id ? getApplication(id) : null
  if (!job || !id) return c.html(<div class="alert alert-error">Application not found.</div>, 404)
  const availabilityState = computeWorkspaceAvailability(id)
  const activeTab = resolveWorkspaceTab(parseWorkspaceTab(c), availabilityState)
  const workspace = (
    <Workspace
      job={job}
      filters={parseFilters(c)}
      activity={getActivity(id)}
      careerEvidence={careerSkillEvidenceMap()}
      activeTab={activeTab}
      availability={tabAvailability(availabilityState)}
    />
  )
  // Fragment for the drawer swap; a full page for direct navigation such as the
  // batch intake "Review" link.
  if (c.req.header('HX-Request') === 'true') return c.html(workspace)
  return c.render(
    <AppShell title={`${job.jobTitle} · ${job.companyName}`} currentPath="/applications">
      {workspace}
    </AppShell>,
  )
})
