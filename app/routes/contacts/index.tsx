import { createRoute } from 'honox/factory'
import { listCompaniesOverview, listContactsOverview } from '../../../src/db/resource-queries'
import { type ContactFilters, ContactsPage } from '../../components/contacts/ContactsPage'
import { ContactsTable } from '../../components/contacts/ContactsTable'

export default createRoute((c) => {
  const q = c.req.query('q')?.trim() ?? ''
  const requestedCompany = Number(c.req.query('company'))
  const company =
    Number.isSafeInteger(requestedCompany) && requestedCompany > 0 ? requestedCompany : 0
  const companies = listCompaniesOverview()
  const companyName = company
    ? (companies.find((item) => item.id === company)?.name ?? undefined)
    : undefined
  const filters: ContactFilters = { q, company: companyName ? String(company) : '' }
  const contacts = listContactsOverview().filter(
    (contact) =>
      (!filters.company || contact.companyId === Number(filters.company)) &&
      (!q ||
        contact.name.toLowerCase().includes(q.toLowerCase()) ||
        contact.companyName.toLowerCase().includes(q.toLowerCase())),
  )
  if (c.req.header('HX-Request') === 'true')
    return c.html(<ContactsTable contacts={contacts} companies={companies} filters={filters} />)
  return c.render(<ContactsPage contacts={contacts} companies={companies} filters={filters} />)
})
