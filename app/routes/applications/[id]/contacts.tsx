import { createRoute } from 'honox/factory'
import { addContactToApplication, getApplication } from '../../../../src/db/queries'
import { parseFilters, parseForm, parseId } from '../../../../src/lib/request'
import { contactSchema } from '../../../../src/lib/validation'
import { ContactsPanel } from '../../../components/workspace/ContactsPanel'

export const POST = createRoute(async (c) => {
  const id = parseId(c.req.param('id'))
  const filters = parseFilters(c)
  const job = id ? getApplication(id) : null
  if (!id || !job) return c.html(<div class="alert alert-error">Application not found.</div>, 404)
  const parsed = contactSchema.safeParse(await parseForm(c))
  if (!parsed.success || !addContactToApplication(id, parsed.data))
    return c.html(
      <ContactsPanel
        job={job}
        filters={filters}
        active
        errors={parsed.success ? undefined : parsed.error.flatten().fieldErrors}
      />,
      422,
    )

  return c.html(<ContactsPanel job={getApplication(id)!} filters={filters} active />)
})
