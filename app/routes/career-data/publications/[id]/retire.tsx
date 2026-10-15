import { createRoute } from 'honox/factory'
import { loadCareerDataView } from '../../../../../src/db/career-data-view'
import {
  listCareerPublications,
  restoreCareerPublication,
  retireCareerPublication,
} from '../../../../../src/db/career-records'
import { db } from '../../../../../src/db/client'
import { parseForm, parseId, queryFlag } from '../../../../../src/lib/request'
import { PublicationList } from '../../../../components/career/PublicationList'

/**
 * Retire/restore one publication. Retirement preserves history (the row and its
 * junctions stay) and keeps it out of every new document input; it stays visible
 * in "show retired" mode and can be restored. This returns the list fragment
 * only.
 */
export const POST = createRoute(async (c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const id = parseId(c.req.param('id'))
  const record =
    id === null
      ? undefined
      : listCareerPublications(db, { includeRetired: true }).find((row) => row.id === id)
  if (!record) return c.text('Not found.', 404)
  const action = String((await parseForm(c)).action ?? '')
  if (action === 'retire') retireCareerPublication(db, record.id)
  else if (action === 'restore') restoreCareerPublication(db, record.id)
  else return c.text('Unsupported action.', 400)
  const view = loadCareerDataView(db, { includeRetired })
  return c.html(
    <PublicationList
      publications={view.publications}
      includeRetired={includeRetired}
      experiences={view.allExperiences}
      projects={view.allProjects}
      directions={view.allDirections}
    />,
  )
})
