import { createRoute } from 'honox/factory'
import { changeStatus, listApplications, metrics } from '../../../../src/db/queries'
import { parseFilters, parseForm, parseId } from '../../../../src/lib/request'
import { statusSchema } from '../../../../src/lib/validation'
import { Board, Metrics } from '../../../components/Dashboard'

export const PATCH = createRoute(async (c) => {
  const id = parseId(c.req.param('id'))
  const filters = parseFilters(c)
  const parsed = statusSchema.safeParse(await parseForm(c))
  if (!id || !parsed.success || !changeStatus(id, parsed.data.action))
    return c.html(<div class="alert alert-error">Invalid status change.</div>, 422)
  return c.html(
    <>
      <Board jobs={listApplications(filters)} filters={filters} />
      <Metrics values={metrics()} oob />
    </>,
  )
})
