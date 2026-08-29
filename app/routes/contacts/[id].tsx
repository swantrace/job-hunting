import type { Context } from 'hono'
import { createRoute } from 'honox/factory'
import { updateManagedItem } from '../../../src/db/queries'
import { listCompaniesOverview, listContactsOverview } from '../../../src/db/resource-queries'
import { parseForm } from '../../../src/lib/request'
import { managedContactSchema } from '../../../src/lib/validation'
import { ContactEditForm } from '../../components/contacts/ContactEditForm'
import type { ContactFilters } from '../../components/contacts/ContactsPage'
import { ContactsTable } from '../../components/contacts/ContactsTable'
import { FlashMessage } from '../../components/responses/FlashMessage'

function filters(c: Context): ContactFilters {
  const company = Number(c.req.query('company'))
  return {
    q: c.req.query('q')?.trim() ?? '',
    company: Number.isSafeInteger(company) && company > 0 ? String(company) : '',
  }
}
function selected(id: number) {
  return listContactsOverview().find((contact) => contact.id === id)
}
function results(value: ContactFilters) {
  return listContactsOverview().filter(
    (contact) =>
      (!value.company || contact.companyId === Number(value.company)) &&
      (!value.q ||
        contact.name.toLowerCase().includes(value.q.toLowerCase()) ||
        contact.companyName.toLowerCase().includes(value.q.toLowerCase())),
  )
}

export const GET = createRoute((c) => {
  const contact = selected(Number(c.req.param('id')))
  return contact
    ? c.html(
        <ContactEditForm
          contact={contact}
          companies={listCompaniesOverview()}
          filters={filters(c)}
        />,
      )
    : c.text('Not found.', 404)
})
export const PUT = createRoute(async (c) => {
  const id = Number(c.req.param('id'))
  const contact = selected(id)
  if (!contact) return c.text('Not found.', 404)
  const currentFilters = filters(c)
  const companies = listCompaniesOverview()
  const parsed = managedContactSchema.safeParse(await parseForm(c))
  if (!parsed.success)
    return c.html(
      <ContactEditForm
        contact={contact}
        companies={companies}
        filters={currentFilters}
        errors={parsed.error.flatten().fieldErrors}
      />,
      422,
    )
  try {
    updateManagedItem('contacts', id, parsed.data)
  } catch {
    return c.html(
      <ContactEditForm
        contact={contact}
        companies={companies}
        filters={currentFilters}
        errors={{ name: ['Unable to save this contact.'] }}
      />,
      409,
    )
  }
  const updated = selected(id)
  if (!updated) return c.text('Not found.', 404)
  return c.html(
    <>
      <ContactEditForm
        contact={updated}
        companies={listCompaniesOverview()}
        filters={currentFilters}
      />
      <ContactsTable
        contacts={results(currentFilters)}
        companies={listCompaniesOverview()}
        filters={currentFilters}
        oob
      />
      <FlashMessage autoDismiss>Contact updated.</FlashMessage>
    </>,
  )
})
