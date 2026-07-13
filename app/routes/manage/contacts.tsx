import { createRoute } from 'honox/factory'
import { createContact, listManagementData } from '../../../src/db/queries'
import { parseForm } from '../../../src/lib/request'
import { managedContactSchema } from '../../../src/lib/validation'
import { ManagementContent } from '../../components/Management'

export const POST = createRoute(async (c) => {
  const parsed = managedContactSchema.safeParse(await parseForm(c))
  if (!parsed.success)
    return c.html(
      <div id="management-content" class="alert alert-error">
        Invalid contact.
      </div>,
      422,
    )
  createContact(parsed.data)
  return c.html(<ManagementContent data={listManagementData()} />)
})
