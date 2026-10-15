import { createRoute } from 'honox/factory'
import { loadCareerDataView } from '../../../../../src/db/career-data-view'
import {
  listCareerAchievements,
  restoreCareerAchievement,
  retireCareerAchievement,
} from '../../../../../src/db/career-records'
import { db } from '../../../../../src/db/client'
import { parseForm, parseId, queryFlag } from '../../../../../src/lib/request'
import { AchievementList } from '../../../../components/career/AchievementList'

/**
 * Retire/restore one achievement. Retirement preserves history (the row and its
 * junctions stay) and removes it from every new document input; it stays visible
 * in "show retired" mode and can be restored. This returns the list fragment
 * only.
 */
export const POST = createRoute(async (c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const id = parseId(c.req.param('id'))
  const record =
    id === null
      ? undefined
      : listCareerAchievements(db, { includeRetired: true }).find((row) => row.id === id)
  if (!record) return c.text('Not found.', 404)
  const action = String((await parseForm(c)).action ?? '')
  if (action === 'retire') retireCareerAchievement(db, record.id)
  else if (action === 'restore') restoreCareerAchievement(db, record.id)
  else return c.text('Unsupported action.', 400)
  const view = loadCareerDataView(db, { includeRetired })
  return c.html(
    <AchievementList
      achievements={view.achievements}
      includeRetired={includeRetired}
      experiences={view.allExperiences}
      catalogSkills={view.catalogSkills}
      publications={view.allPublications}
      directions={view.allDirections}
    />,
  )
})
