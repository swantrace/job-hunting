import { createRoute } from 'honox/factory'
import { createApplication, listApplications, metrics } from '../../../src/db/queries'
import { parseFilters, parseForm } from '../../../src/lib/request'
import { quickCollectSchema } from '../../../src/lib/validation'
import { Board, QuickCollect } from '../../components/Dashboard'
import { MutationResponse } from '../../components/Responses'

export const GET = createRoute((c) => {
  const filters = parseFilters(c)
  return c.html(<Board jobs={listApplications(filters)} filters={filters} />)
})

export const POST = createRoute(async (c) => {
  const filters = parseFilters(c)
  const raw = await parseForm(c)
  const parsed = quickCollectSchema.safeParse(raw)
  if (!parsed.success)
    return c.html(
      <QuickCollect
        filters={filters}
        errors={parsed.error.flatten().fieldErrors}
        values={raw as Record<string, string>}
      />,
      422,
    )
  createApplication(parsed.data)
  return c.html(
    <MutationResponse
      jobs={listApplications(filters)}
      filters={filters}
      values={metrics()}
      resetQuick
    />,
  )
})
