import { createRoute } from 'honox/factory'
import { listCompaniesOverview } from '../../../src/db/resource-queries'
import { CompaniesPage, type CompanyFilters } from '../../components/companies/CompaniesPage'

export default createRoute((c) => {
  const q = c.req.query('q')?.trim() ?? ''
  const filters: CompanyFilters = { q }
  const companies = listCompaniesOverview().filter(
    (company) => !q || company.name.toLowerCase().includes(q.toLowerCase()),
  )
  return c.render(<CompaniesPage companies={companies} filters={filters} />)
})
