import { createRoute } from 'honox/factory'
import { listManagementData } from '../../../../src/db/queries'
import { ManagementForm, type ManagementKind } from '../../../components/Management'

export default createRoute((c) => {
  const kind = c.req.param('kind')
  if (!kind || !['skills', 'companies', 'contacts'].includes(kind)) return c.text('Not found.', 404)
  return c.html(<ManagementForm kind={kind as ManagementKind} data={listManagementData()} />)
})
