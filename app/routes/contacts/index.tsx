import { createRoute } from 'honox/factory'
import { listContactsOverview } from '../../../src/db/resource-queries'
import { type ContactFilters, ContactsPage } from '../../components/contacts/ContactsPage'

export default createRoute((c) => {
  const q = c.req.query('q')?.trim() ?? ''
  const filters: ContactFilters = { q, company: '' }
  const contacts = listContactsOverview().filter(
    (contact) =>
      !q ||
      contact.name.toLowerCase().includes(q.toLowerCase()) ||
      contact.companyName.toLowerCase().includes(q.toLowerCase()),
  )
  return c.render(<ContactsPage contacts={contacts} filters={filters} />)
})
