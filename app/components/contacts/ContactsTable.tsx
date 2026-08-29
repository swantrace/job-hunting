import type { CompanyOverview, ContactOverview } from '../../../src/db/resource-queries'
import { Icon } from '../ui/Icon'
import type { ContactFilters } from './ContactsPage'

export function ContactsTable({
  contacts,
  companies,
  filters,
  oob = false,
}: {
  contacts: ContactOverview[]
  companies: CompanyOverview[]
  filters: ContactFilters
  oob?: boolean
}) {
  const query = new URLSearchParams({ q: filters.q, company: filters.company }).toString()
  const companyName = filters.company
    ? (companies.find((company) => company.id === Number(filters.company))?.name ?? undefined)
    : undefined
  return (
    <section id="contacts-results" {...(oob ? { 'hx-swap-oob': 'outerHTML' } : {})}>
      <form
        class="card border border-base-300 bg-base-100"
        hx-get="/contacts"
        hx-target="#contacts-results"
        hx-swap="outerHTML"
        hx-push-url="true"
        hx-sync="this:replace"
        hx-trigger="input changed delay:350ms from:input[name='q'], change from:select[name='company']"
      >
        <div class="card-body gap-3 p-4">
          {companyName ? (
            <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span class="badge badge-outline">Company: {companyName}</span>
              <a
                class="btn btn-ghost btn-xs"
                href={filters.q ? `/contacts?q=${encodeURIComponent(filters.q)}` : '/contacts'}
              >
                Clear company filter
              </a>
            </div>
          ) : null}
          <div class="grid gap-3 sm:grid-cols-2">
            <input
              type="search"
              name="q"
              value={filters.q}
              placeholder="Search contacts"
              class="input w-full"
            />
            <select name="company" class="select w-full" aria-label="Filter by company">
              <option value="">All companies</option>
              {companies.map((company) => (
                <option value={company.id} selected={String(company.id) === filters.company}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>
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
              <th class="text-right">Actions</th>
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
                <td class="text-right">
                  <button
                    class="btn btn-ghost btn-sm"
                    hx-get={`/contacts/${contact.id}?${query}`}
                    hx-target="#contact-workspace-panel"
                    hx-swap="innerHTML"
                    data-open-drawer="contact-workspace-toggle"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!contacts.length && <p class="p-4 text-sm text-base-content/60">No contacts found.</p>}
      </div>
    </section>
  )
}
