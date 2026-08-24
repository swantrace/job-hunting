import { createRoute } from 'honox/factory'
import {
  getApplication,
  listApplications,
  metrics,
  updateApplication,
} from '../../../../src/db/queries'
import { parseFilters, parseForm, parseId } from '../../../../src/lib/request'
import { applicationSchema } from '../../../../src/lib/validation'
import { Board, Metrics } from '../../../components/Dashboard'
import { FlashMessage } from '../../../components/responses/FlashMessage'
import { ApplicationForm } from '../../../components/Workspace'
import { WorkspaceHeader } from '../../../components/workspace/WorkspaceHeader'

export const PUT = createRoute(async (c) => {
  const id = parseId(c.req.param('id'))
  const filters = parseFilters(c)
  if (!id) return c.html(<div class="alert alert-error">Invalid application.</div>, 404)
  const raw = await parseForm(c)
  const parsed = applicationSchema.safeParse(raw)
  const job = getApplication(id)
  if (!job) return c.html(<div class="alert alert-error">Application not found.</div>, 404)
  if (!parsed.success)
    return c.html(
      <ApplicationForm
        job={{ ...job, ...raw } as typeof job}
        filters={filters}
        errors={parsed.error.flatten().fieldErrors}
      />,
      422,
    )
  updateApplication(id, parsed.data)
  const updated = getApplication(id)!
  return c.html(
    <>
      <ApplicationForm job={updated} filters={filters} />
      <Board jobs={listApplications(filters)} filters={filters} oob />
      <Metrics values={metrics()} oob />
      <WorkspaceHeader job={updated} oob />
      <FlashMessage autoDismiss>Application marked as sent.</FlashMessage>
    </>,
  )
})
