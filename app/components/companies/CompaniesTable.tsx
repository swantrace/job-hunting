import type { CompanyOverview } from '../../../src/db/resource-queries'
import { Icon } from '../ui/Icon'
import type { CompanyFilters } from './CompaniesPage'

export function CompaniesTable({
  companies,
  filters,
  oob = false,
}: {
  companies: CompanyOverview[]
  filters: CompanyFilters
  oob?: boolean
}) {
  const query = new URLSearchParams(filters).toString()
  return (
    <section id="companies-results" {...(oob ? { 'hx-swap-oob': 'outerHTML' } : {})}>
      <form
        class="card border border-base-300 bg-base-100"
        hx-get="/companies"
        hx-target="#companies-results"
        hx-swap="outerHTML"
        hx-push-url="true"
      >
        <div class="card-body gap-3 p-4">
          <input
            type="search"
            name="q"
            value={filters.q}
            placeholder="Search companies"
            class="input w-full"
          />
        </div>
      </form>

      <div class="mt-4 overflow-hidden rounded-box border border-base-300 bg-base-100">
        <table class="table table-sm">
          <caption class="sr-only">Companies</caption>
          <thead>
            <tr>
              <th>Name</th>
              <th>Website</th>
              <th>Applications</th>
              <th>Contacts</th>
              <th>Last activity</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((company) => (
              <tr class="border-base-200 hover:bg-base-200/50">
                <td class="font-medium">{company.name}</td>
                <td>
                  {company.website ? (
                    <a
                      class="link inline-flex items-center gap-1"
                      href={company.website}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open <Icon name="external" className="size-3" />
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
                <td>{company.applicationCount}</td>
                <td>
                  <a
                    class="link link-hover"
                    href={`/contacts?company=${company.id}`}
                    aria-label={`View contacts at ${company.name}`}
                  >
                    {company.contactCount}
                  </a>
                </td>
                <td>{company.lastActivity ?? '—'}</td>
                <td class="text-right">
                  <button
                    class="btn btn-ghost btn-sm"
                    hx-get={`/companies/${company.id}?${query}`}
                    hx-target="#company-workspace-panel"
                    hx-swap="innerHTML"
                    data-open-drawer="company-workspace-toggle"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!companies.length && <p class="p-4 text-sm text-base-content/60">No companies found.</p>}
      </div>
    </section>
  )
}
