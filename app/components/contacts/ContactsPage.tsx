import type { CompanyOverview, ContactOverview } from '../../../src/db/resource-queries'
import { AppShell } from '../layout/AppShell'
import { ContactsTable } from './ContactsTable'
import { ContactWorkspace } from './ContactWorkspace'

export type ContactFilters = { q: string; company: string }

export function ContactsPage({
  contacts,
  companies,
  filters,
}: {
  contacts: ContactOverview[]
  companies: CompanyOverview[]
  filters: ContactFilters
}) {
  return (
    <AppShell title="Contacts" currentPath="/contacts">
      <ContactWorkspace>
        <ContactsTable contacts={contacts} companies={companies} filters={filters} />
      </ContactWorkspace>
    </AppShell>
  )
}
