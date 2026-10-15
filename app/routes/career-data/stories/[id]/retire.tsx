import { createRoute } from 'honox/factory'
import { loadCareerDataView } from '../../../../../src/db/career-data-view'
import {
  listCareerStories,
  restoreCareerStory,
  retireCareerStory,
} from '../../../../../src/db/career-records'
import { db } from '../../../../../src/db/client'
import { parseForm, parseId, queryFlag } from '../../../../../src/lib/request'
import { StoryList } from '../../../../components/career/StoryList'

/**
 * Retire/restore one story. Retirement preserves history and keeps it out of
 * every document input; it stays visible in "show retired" mode and can be
 * restored. This returns the list fragment only.
 */
export const POST = createRoute(async (c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const id = parseId(c.req.param('id'))
  const record =
    id === null
      ? undefined
      : listCareerStories(db, { includeRetired: true }).find((row) => row.id === id)
  if (!record) return c.text('Not found.', 404)
  const action = String((await parseForm(c)).action ?? '')
  if (action === 'retire') retireCareerStory(db, record.id)
  else if (action === 'restore') restoreCareerStory(db, record.id)
  else return c.text('Unsupported action.', 400)
  const view = loadCareerDataView(db, { includeRetired })
  return c.html(
    <StoryList
      stories={view.stories}
      includeRetired={includeRetired}
      experiences={view.allExperiences}
      directions={view.allDirections}
    />,
  )
})
