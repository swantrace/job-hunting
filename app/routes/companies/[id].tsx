import type { Context } from 'hono'
import { createRoute } from 'honox/factory'
import { updateManagedItem } from '../../../src/db/queries'
import { listCompaniesOverview } from '../../../src/db/resource-queries'
import { parseForm } from '../../../src/lib/request'
import { companySchema } from '../../../src/lib/validation'
import type { CompanyFilters } from '../../components/companies/CompaniesPage'
import { CompaniesTable } from '../../components/companies/CompaniesTable'
import { CompanyEditForm } from '../../components/companies/CompanyEditForm'
import { FlashMessage } from '../../components/responses/FlashMessage'

function filters(c: Context): CompanyFilters {
  return { q: c.req.query('q')?.trim() ?? '' }
}
function selected(id: number) {
  return listCompaniesOverview().find((company) => company.id === id)
}
function results(value: CompanyFilters) {
  return listCompaniesOverview().filter(
    (company) => !value.q || company.name.toLowerCase().includes(value.q.toLowerCase()),
  )
}

export const GET = createRoute((c) => {
  const company = selected(Number(c.req.param('id')))
  return company
    ? c.html(<CompanyEditForm company={company} filters={filters(c)} />)
    : c.text('Not found.', 404)
})
export const PUT = createRoute(async (c) => {
  const id = Number(c.req.param('id'))
  const company = selected(id)
  if (!company) return c.text('Not found.', 404)
  const currentFilters = filters(c)
  const parsed = companySchema.safeParse(await parseForm(c))
  if (!parsed.success)
    return c.html(
      <CompanyEditForm
        company={company}
        filters={currentFilters}
        errors={parsed.error.flatten().fieldErrors}
      />,
      422,
    )
  try {
    updateManagedItem('companies', id, parsed.data)
  } catch {
    return c.html(
      <CompanyEditForm
        company={company}
        filters={currentFilters}
        errors={{ name: ['Unable to save this company.'] }}
      />,
      409,
    )
  }
  const updated = selected(id)
  if (!updated) return c.text('Not found.', 404)
  return c.html(
    <>
      <CompanyEditForm company={updated} filters={currentFilters} />
      <CompaniesTable companies={results(currentFilters)} filters={currentFilters} oob />
      <FlashMessage autoDismiss>Company updated.</FlashMessage>
    </>,
  )
})
