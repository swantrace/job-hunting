import { createRoute } from 'honox/factory'
import { getActivity, getApplication } from '../../../../src/db/queries'
import { careerSkillEvidenceMap } from '../../../../src/lib/career-data'
import { parseFilters, parseId, parseWorkspaceTab } from '../../../../src/lib/request'
import { computeWorkspaceAvailability } from '../../../../src/lib/workspace/availability'
import { resolveWorkspaceTab, tabAvailability } from '../../../../src/lib/workspace/state'
import { Workspace } from '../../../components/Workspace'

export default createRoute((c) => {
  const id = parseId(c.req.param('id'))
  const job = id ? getApplication(id) : null
  if (!job || !id) return c.html(<div class="alert alert-error">Application not found.</div>, 404)
  const availabilityState = computeWorkspaceAvailability(id)
  const activeTab = resolveWorkspaceTab(parseWorkspaceTab(c), availabilityState)
  return c.html(
    <Workspace
      job={job}
      filters={parseFilters(c)}
      activity={getActivity(id)}
      careerEvidence={careerSkillEvidenceMap()}
      activeTab={activeTab}
      availability={tabAvailability(availabilityState)}
    />,
  )
})
