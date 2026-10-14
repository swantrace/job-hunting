import { createRoute } from 'honox/factory'
import { listCareerEducation, moveCareerEducation } from '../../../../../src/db/career-records'
import { db } from '../../../../../src/db/client'
import { parseForm, parseId, queryFlag } from '../../../../../src/lib/request'
import { EducationList } from '../../../../components/career/EducationList'

/**
 * Moves one education record up or down the editorial order. Only the moved
 * row's `sort_order` changes. This returns the list fragment only.
 */
export const POST = createRoute(async (c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const id = parseId(c.req.param('id'))
  const record =
    id === null
      ? undefined
      : listCareerEducation(db, { includeRetired: true }).find((row) => row.id === id)
  if (!record) return c.text('Not found.', 404)
  const direction = String((await parseForm(c)).direction ?? '')
  if (direction !== 'up' && direction !== 'down') return c.text('Unsupported direction.', 400)
  moveCareerEducation(db, record.id, direction)
  return c.html(
    <EducationList
      education={listCareerEducation(db, { includeRetired })}
      includeRetired={includeRetired}
    />,
  )
})
