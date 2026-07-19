import { createRoute } from 'honox/factory'
import { createContact, listManagementData, updateManagedItem } from '../../../src/db/queries'
import { parseForm } from '../../../src/lib/request'
import { managedContactSchema } from '../../../src/lib/validation'
import { ManagementContent } from '../../components/Management'

export const POST = createRoute(async (c) => {
  const form = await parseForm(c)
  const parsed = managedContactSchema.safeParse(form)
  if (!parsed.success)
    return c.html(
      <div id="management-content" class="alert alert-error">
        Invalid contact.
      </div>,
      422,
    )
  const editId = Number(form.editId)
  if (Number.isSafeInteger(editId) && editId > 0) updateManagedItem('contacts', editId, parsed.data)
  else createContact(parsed.data)
  return c.html(<ManagementContent data={listManagementData()} />)
})
