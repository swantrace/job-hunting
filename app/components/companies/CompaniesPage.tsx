import type { CompanyOverview } from '../../../src/db/resource-queries'
import { AppShell } from '../layout/AppShell'
import { CompaniesTable } from './CompaniesTable'
import { CompanyWorkspace } from './CompanyWorkspace'

export type CompanyFilters = { q: string }

export function CompaniesPage({
  companies,
  filters,
}: {
  companies: CompanyOverview[]
  filters: CompanyFilters
}) {
  return (
    <AppShell title="Companies" currentPath="/companies">
      <CompanyWorkspace>
        <CompaniesTable companies={companies} filters={filters} />
      </CompanyWorkspace>
    </AppShell>
  )
}
