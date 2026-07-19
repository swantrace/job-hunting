import { createRoute } from 'honox/factory'
import { createCompany, listManagementData, updateManagedItem } from '../../../src/db/queries'
import { parseForm } from '../../../src/lib/request'
import { companySchema } from '../../../src/lib/validation'
import { ManagementContent } from '../../components/Management'

export const POST = createRoute(async (c) => {
  const form = await parseForm(c)
  const parsed = companySchema.safeParse(form)
  if (!parsed.success)
    return c.html(
      <div id="management-content" class="alert alert-error">
        Invalid company.
      </div>,
      422,
    )
  const editId = Number(form.editId)
  if (Number.isSafeInteger(editId) && editId > 0)
    updateManagedItem('companies', editId, parsed.data)
  else createCompany(parsed.data.name, parsed.data.website)
  return c.html(<ManagementContent data={listManagementData()} />)
})
