import { createRoute } from 'honox/factory'
import { loadCareerDataView } from '../../../../../src/db/career-data-view'
import {
  listCareerPortfolioTopics,
  restoreCareerPortfolioTopic,
  retireCareerPortfolioTopic,
} from '../../../../../src/db/career-records'
import { db } from '../../../../../src/db/client'
import { parseForm, parseId, queryFlag } from '../../../../../src/lib/request'
import { PortfolioList } from '../../../../components/career/PortfolioList'

/**
 * Retire/restore one portfolio topic. Retirement preserves history and keeps it
 * out of every document input; it stays visible in "show retired" mode and can
 * be restored. This returns the list fragment only.
 */
export const POST = createRoute(async (c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const id = parseId(c.req.param('id'))
  const record =
    id === null
      ? undefined
      : listCareerPortfolioTopics(db, { includeRetired: true }).find((row) => row.id === id)
  if (!record) return c.text('Not found.', 404)
  const action = String((await parseForm(c)).action ?? '')
  if (action === 'retire') retireCareerPortfolioTopic(db, record.id)
  else if (action === 'restore') restoreCareerPortfolioTopic(db, record.id)
  else return c.text('Unsupported action.', 400)
  const view = loadCareerDataView(db, { includeRetired })
  return c.html(
    <PortfolioList
      topics={view.portfolioTopics}
      includeRetired={includeRetired}
      projects={view.allProjects}
      directions={view.allDirections}
    />,
  )
})
