import { createRoute } from 'honox/factory'
import { listManagementData } from '../../../../../src/db/queries'
import type { ManagementKind } from '../../../../components/Management'
import { ManagementForm } from '../../../../components/ManagementForm'

export default createRoute((c) => {
  const kind = c.req.param('kind')
  const id = Number(c.req.param('id'))
  if (
    !kind ||
    !['skills', 'companies', 'contacts'].includes(kind) ||
    !Number.isSafeInteger(id) ||
    id < 1
  )
    return c.text('Not found.', 404)
  const data = listManagementData()
  const exists =
    kind === 'skills'
      ? data.skills.some((item) => item.id === id)
      : kind === 'companies'
        ? data.companies.some((item) => item.id === id)
        : data.contacts.some((item) => item.contact.id === id)
  if (!exists) return c.text('Not found.', 404)
  return c.html(<ManagementForm kind={kind as ManagementKind} data={data} editId={id} />)
})
