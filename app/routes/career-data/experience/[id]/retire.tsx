import { createRoute } from 'honox/factory'
import {
  listCareerExperiences,
  restoreCareerExperience,
  retireCareerExperience,
} from '../../../../../src/db/career-records'
import { db } from '../../../../../src/db/client'
import { parseForm, parseId, queryFlag } from '../../../../../src/lib/request'
import { ExperienceList } from '../../../../components/career/ExperienceList'

/**
 * Retire/restore one experience. Retirement preserves history (the row and its
 * junction content stay) and removes it from the records new documents can use;
 * it stays visible in "show retired" mode and can be restored. This returns the
 * list fragment only.
 */
export const POST = createRoute(async (c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const id = parseId(c.req.param('id'))
  const record =
    id === null
      ? undefined
      : listCareerExperiences(db, { includeRetired: true }).find((row) => row.id === id)
  if (!record) return c.text('Not found.', 404)
  const action = String((await parseForm(c)).action ?? '')
  if (action === 'retire') retireCareerExperience(db, record.id)
  else if (action === 'restore') restoreCareerExperience(db, record.id)
  else return c.text('Unsupported action.', 400)
  return c.html(
    <ExperienceList
      experiences={listCareerExperiences(db, { includeRetired })}
      includeRetired={includeRetired}
    />,
  )
})
