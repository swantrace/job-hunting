import { createRoute } from 'honox/factory'
import { listCareerExperiences, moveCareerExperience } from '../../../../../src/db/career-records'
import { db } from '../../../../../src/db/client'
import { parseForm, parseId, queryFlag } from '../../../../../src/lib/request'
import { ExperienceList } from '../../../../components/career/ExperienceList'

/**
 * Moves one experience up or down the editorial order. Only the moved row's
 * `sort_order` changes, so ordering never rewrites sibling records or revisions.
 * This returns the list fragment only.
 */
export const POST = createRoute(async (c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const id = parseId(c.req.param('id'))
  const record =
    id === null
      ? undefined
      : listCareerExperiences(db, { includeRetired: true }).find((row) => row.id === id)
  if (!record) return c.text('Not found.', 404)
  const direction = String((await parseForm(c)).direction ?? '')
  if (direction !== 'up' && direction !== 'down') return c.text('Unsupported direction.', 400)
  moveCareerExperience(db, record.id, direction)
  return c.html(
    <ExperienceList
      experiences={listCareerExperiences(db, { includeRetired })}
      includeRetired={includeRetired}
    />,
  )
})
