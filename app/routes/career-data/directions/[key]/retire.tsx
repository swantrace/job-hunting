import { createRoute } from 'honox/factory'
import { loadCareerDataView } from '../../../../../src/db/career-data-view'
import {
  readCareerDirection,
  restoreCareerDirection,
  retireCareerDirection,
} from '../../../../../src/db/career-directions'
import { db } from '../../../../../src/db/client'
import { parseForm, queryFlag } from '../../../../../src/lib/request'
import { DirectionList } from '../../../../components/career/DirectionList'

/**
 * Retire/restore one direction. Retirement preserves its history, keeps it out
 * of every document input and can be undone. This returns the list fragment only.
 */
export const POST = createRoute(async (c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const record = readCareerDirection(db, c.req.param('key') ?? '')
  if (!record) return c.text('Not found.', 404)
  const action = String((await parseForm(c)).action ?? '')
  if (action === 'retire') retireCareerDirection(db, record.key)
  else if (action === 'restore') restoreCareerDirection(db, record.key)
  else return c.text('Unsupported action.', 400)
  const view = loadCareerDataView(db, { includeRetired })
  return c.html(<DirectionList directions={view.directions} includeRetired={includeRetired} />)
})
