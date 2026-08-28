import { createRoute } from 'honox/factory'
import {
  deleteManagedItem,
  listManagementData,
  updateManagedItem,
} from '../../../../src/db/queries'
import { parseForm } from '../../../../src/lib/request'
import { companySchema, managedContactSchema, skillSchema } from '../../../../src/lib/validation'
import { ManagementContent, type ManagementKind } from '../../../components/Management'

const kinds = ['skills', 'companies', 'contacts'] as const

const invalidItem = () => (
  <>
    <ManagementContent data={listManagementData()} />
    <div id="flash" hx-swap-oob="innerHTML">
      <div class="alert alert-error">Invalid item.</div>
    </div>
  </>
)

export const DELETE = createRoute((c) => {
  const kind = c.req.param('kind') ?? ''
  const id = Number(c.req.param('id'))
  if (!kinds.includes(kind as ManagementKind) || !Number.isSafeInteger(id) || id < 1)
    return c.html(invalidItem(), 422)
  if (!deleteManagedItem(kind as ManagementKind, id))
    return c.html(
      <>
        <ManagementContent data={listManagementData()} />
        <div id="flash" hx-swap-oob="innerHTML">
          <div class="alert alert-warning">This item is still in use.</div>
        </div>
      </>,
      409,
    )
  return c.html(<ManagementContent data={listManagementData()} />)
})

export const PUT = createRoute(async (c) => {
  const kind = c.req.param('kind') ?? ''
  const id = Number(c.req.param('id'))
  if (!kinds.includes(kind as ManagementKind) || !Number.isSafeInteger(id) || id < 1)
    return c.html(invalidItem(), 422)
  const schema =
    kind === 'skills' ? skillSchema : kind === 'companies' ? companySchema : managedContactSchema
  const parsed = schema.safeParse(await parseForm(c))
  if (!parsed.success)
    return c.html(
      <ManagementContent
        data={listManagementData()}
        error={`Invalid ${kind.slice(0, -1)}.`}
        errorKind={kind as ManagementKind}
        editId={id}
      />,
      422,
    )
  try {
    updateManagedItem(kind as ManagementKind, id, parsed.data)
  } catch {
    return c.html(
      <>
        <ManagementContent data={listManagementData()} />
        <div id="flash" hx-swap-oob="innerHTML">
          <div class="alert alert-error">Unable to update this item.</div>
        </div>
      </>,
      409,
    )
  }
  return c.html(<ManagementContent data={listManagementData()} />)
})
