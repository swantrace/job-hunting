import { createRoute } from 'honox/factory'
import {
  addFollowUp,
  getActivity,
  getApplication,
  listApplications,
  metrics,
} from '../../../../src/db/queries'
import { parseFilters, parseForm, parseId } from '../../../../src/lib/request'
import { followUpSchema } from '../../../../src/lib/validation'
import { Board, Metrics } from '../../../components/Dashboard'
import { Workspace } from '../../../components/Workspace'

export const POST = createRoute(async (c) => {
  const id = parseId(c.req.param('id'))
  const filters = parseFilters(c)
  const job = id ? getApplication(id) : null
  if (!id || !job) return c.html(<div class="alert alert-error">Application not found.</div>, 404)
  const parsed = followUpSchema.safeParse(await parseForm(c))
  if (!parsed.success || !addFollowUp(id, parsed.data))
    return c.html(
      <Workspace
        job={job}
        filters={filters}
        activity={getActivity(id)}
        activeTab="activity"
        errorForm="follow-up"
        errors={parsed.success ? undefined : parsed.error.flatten().fieldErrors}
      />,
      422,
    )

  const updated = getApplication(id)!
  return c.html(
    <>
      <Workspace job={updated} filters={filters} activity={getActivity(id)} />
      <Board jobs={listApplications(filters)} filters={filters} oob />
      <Metrics values={metrics()} oob />
    </>,
  )
})
