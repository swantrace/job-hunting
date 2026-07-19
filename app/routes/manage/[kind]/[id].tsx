import { createRoute } from 'honox/factory'
import {
  deleteManagedItem,
  listManagementData,
  updateManagedItem,
} from '../../../../src/db/queries'
import { parseForm } from '../../../../src/lib/request'
import { companySchema, managedContactSchema, skillSchema } from '../../../../src/lib/validation'
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

export const PUT = createRoute(async (c) => {
  const kind = c.req.param('kind') ?? ''
  const id = Number(c.req.param('id'))
  if (!['skills', 'companies', 'contacts'].includes(kind) || !Number.isSafeInteger(id) || id < 1)
    return c.html(
      <div id="management-content" class="alert alert-error">
        Invalid item.
      </div>,
      422,
    )
  const schema =
    kind === 'skills' ? skillSchema : kind === 'companies' ? companySchema : managedContactSchema
  const parsed = schema.safeParse(await parseForm(c))
  if (!parsed.success)
    return c.html(
      <div id="management-content" class="alert alert-error">
        Invalid {kind.slice(0, -1)}.
      </div>,
      422,
    )
  try {
    updateManagedItem(kind as 'skills' | 'companies' | 'contacts', id, parsed.data)
  } catch {
    return c.html(
      <div id="management-content" class="alert alert-error">
        Unable to update this item.
      </div>,
      409,
    )
  }
  return c.html(<ManagementContent data={listManagementData()} />)
})
