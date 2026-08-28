import type { ContactOverview } from '../../../src/db/resource-queries'
import { Icon } from '../ui/Icon'
import type { ContactFilters } from './ContactsPage'

export function ContactsTable({
  contacts,
  filters,
}: {
  contacts: ContactOverview[]
  filters: ContactFilters
}) {
  return (
    <section id="contacts-results">
      <form
        class="card border border-base-300 bg-base-100"
        hx-get="/contacts"
        hx-target="#contacts-results"
        hx-swap="outerHTML"
        hx-push-url="true"
      >
        <div class="card-body gap-3 p-4">
          <input
            type="search"
            name="q"
            value={filters.q}
            placeholder="Search contacts"
            class="input w-full"
          />
        </div>
      </form>

      <div class="mt-4 overflow-hidden rounded-box border border-base-300 bg-base-100">
        <table class="table table-sm">
          <caption class="sr-only">Contacts</caption>
          <thead>
            <tr>
              <th>Name</th>
              <th>Company</th>
              <th>Email</th>
              <th>LinkedIn</th>
              <th>Applications</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((contact) => (
              <tr class="border-base-200 hover:bg-base-200/50">
                <td class="font-medium">{contact.name}</td>
                <td>{contact.companyName}</td>
                <td>
                  {contact.email ? (
                    <a class="link" href={`mailto:${contact.email}`}>
                      {contact.email}
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  {contact.linkedinUrl ? (
                    <a
                      class="link inline-flex items-center gap-1"
                      href={contact.linkedinUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      LinkedIn <Icon name="external" className="size-3" />
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
                <td>{contact.applicationCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!contacts.length && <p class="p-4 text-sm text-base-content/60">No contacts found.</p>}
      </div>
    </section>
  )
}
