import { createRoute } from 'honox/factory'
import { changeStatus, getApplication, listApplications, metrics } from '../../../../src/db/queries'
import { parseFilters, parseForm, parseId } from '../../../../src/lib/request'
import { statusSchema } from '../../../../src/lib/validation'
import { Board, Metrics } from '../../../components/Dashboard'
import { FlashMessage } from '../../../components/responses/FlashMessage'
import { WorkspaceHeader } from '../../../components/workspace/WorkspaceHeader'

export const PATCH = createRoute(async (c) => {
  const id = parseId(c.req.param('id'))
  const filters = parseFilters(c)
  const parsed = statusSchema.safeParse(await parseForm(c))
  if (!id || !parsed.success || !changeStatus(id, parsed.data.action)) {
    // The board is the swap target: return the unchanged board plus an OOB flash,
    // never a bare alert that would replace the whole board.
    return c.html(
      <>
        <Board jobs={listApplications(filters)} filters={filters} />
        <FlashMessage tone="error">Invalid status change.</FlashMessage>
      </>,
      422,
    )
  }
  const updated = getApplication(id)
  return c.html(
    <>
      <Board jobs={listApplications(filters)} filters={filters} />
      <Metrics values={metrics()} oob />
      {updated && <WorkspaceHeader job={updated} oob />}
    </>,
  )
})
