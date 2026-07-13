import { createRoute } from 'honox/factory'
import { getApplication } from '../../../../src/db/queries'
import { parseFilters, parseId } from '../../../../src/lib/request'
import { ApplicationForm } from '../../../components/Workspace'

export default createRoute((c) => {
  const id = parseId(c.req.param('id'))
  const job = id ? getApplication(id) : null
  if (!job) return c.html(<div class="alert alert-error">Application not found.</div>, 404)
  return c.html(<ApplicationForm job={job} filters={parseFilters(c)} />)
})
