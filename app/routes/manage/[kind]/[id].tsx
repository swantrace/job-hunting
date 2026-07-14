import { createRoute } from 'honox/factory'
import { deleteManagedItem, listManagementData } from '../../../../src/db/queries'
import { ManagementContent } from '../../../components/Management'

export const DELETE = createRoute((c) => {
  const kind = c.req.param('kind') ?? ''
  const id = Number(c.req.param('id'))
  if (!['skills', 'companies', 'contacts'].includes(kind) || !Number.isSafeInteger(id) || id < 1)
    return c.html(
      <div id="management-content" class="alert alert-error">
        Invalid item.
      </div>,
      422,
    )
  if (!deleteManagedItem(kind as 'skills' | 'companies' | 'contacts', id))
    return c.html(
      <div id="management-content" class="alert alert-warning">
        This item is still in use.
      </div>,
      409,
    )
  return c.html(<ManagementContent data={listManagementData()} />)
})
