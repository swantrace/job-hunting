import { createRoute } from 'honox/factory'
import { createCompany, listManagementData } from '../../../src/db/queries'
import { parseForm } from '../../../src/lib/request'
import { companySchema } from '../../../src/lib/validation'
import { ManagementContent } from '../../components/Management'

export const POST = createRoute(async (c) => {
  const parsed = companySchema.safeParse(await parseForm(c))
  if (!parsed.success)
    return c.html(
      <div id="management-content" class="alert alert-error">
        Invalid company.
      </div>,
      422,
    )
  createCompany(parsed.data.name, parsed.data.website)
  return c.html(<ManagementContent data={listManagementData()} />)
})
