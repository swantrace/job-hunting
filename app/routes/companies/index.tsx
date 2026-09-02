import { createRoute } from 'honox/factory'
import { listCompaniesOverview } from '../../../src/db/resource-queries'
import { CompaniesPage, type CompanyFilters } from '../../components/companies/CompaniesPage'
import { CompaniesTable } from '../../components/companies/CompaniesTable'

export default createRoute((c) => {
  const q = c.req.query('q')?.trim() ?? ''
  const filters: CompanyFilters = { q }
  const companies = listCompaniesOverview().filter(
    (company) => !q || company.name.toLowerCase().includes(q.toLowerCase()),
  )
  if (c.req.header('HX-Request') === 'true')
    return c.html(<CompaniesTable companies={companies} filters={filters} />)
  return c.render(<CompaniesPage companies={companies} filters={filters} />)
})
