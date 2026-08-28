import { createRoute } from 'honox/factory'
import { getActivity, getApplication } from '../../../../src/db/queries'
import { parseFilters, parseId, parseWorkspaceTab } from '../../../../src/lib/request'
import { Workspace } from '../../../components/Workspace'

export default createRoute((c) => {
  const id = parseId(c.req.param('id'))
  const job = id ? getApplication(id) : null
  if (!job || !id) return c.html(<div class="alert alert-error">Application not found.</div>, 404)
  return c.html(
    <Workspace
      job={job}
      filters={parseFilters(c)}
      activity={getActivity(id)}
      activeTab={parseWorkspaceTab(c)}
    />,
  )
})
