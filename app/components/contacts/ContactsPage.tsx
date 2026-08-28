import type { ContactOverview } from '../../../src/db/resource-queries'
import { AppShell } from '../layout/AppShell'
import { ContactsTable } from './ContactsTable'
import { ContactWorkspace } from './ContactWorkspace'

export type ContactFilters = { q: string; company: string }

export function ContactsPage({
  contacts,
  filters,
}: {
  contacts: ContactOverview[]
  filters: ContactFilters
}) {
  return (
    <AppShell title="Contacts" currentPath="/contacts">
      <ContactWorkspace>
        <ContactsTable contacts={contacts} filters={filters} />
      </ContactWorkspace>
    </AppShell>
  )
}
