import { createRoute } from 'honox/factory'
import {
  addInterview,
  getActivity,
  getApplication,
  listApplications,
  metrics,
} from '../../../../src/db/queries'
import { parseFilters, parseForm, parseId } from '../../../../src/lib/request'
import { interviewSchema } from '../../../../src/lib/validation'
import { Board, Metrics } from '../../../components/Dashboard'
import { Workspace } from '../../../components/Workspace'

export const POST = createRoute(async (c) => {
  const id = parseId(c.req.param('id'))
  const filters = parseFilters(c)
  const parsed = interviewSchema.safeParse(await parseForm(c))
  if (!id || !parsed.success || !addInterview(id, parsed.data))
    return c.html(<div class="alert alert-error">Check the interview details.</div>, 422)
  const job = getApplication(id)!
  return c.html(
    <>
      <Workspace job={job} filters={filters} activity={getActivity(id)} />
      <Board jobs={listApplications(filters)} filters={filters} oob />
      <Metrics values={metrics()} oob />
    </>,
  )
})
