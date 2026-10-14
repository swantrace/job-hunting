import { createRoute } from 'honox/factory'
import { loadCareerDataView } from '../../../src/db/career-data-view'
import { db } from '../../../src/db/client'
import { queryFlag } from '../../../src/lib/request'
import { CareerDataPage } from '../../components/career/CareerDataPage'
import { parseCareerDataTab } from '../../components/career/CareerDataTabs'

/**
 * Career Data section entry point. Full page with AppShell; the tab URLs
 * (`/career-data/<section>`) render the same page and their HTMX requests return
 * only the section fragment.
 */
export default createRoute((c) => {
  const activeTab = parseCareerDataTab(c.req.query('tab'))
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const view = loadCareerDataView(db, { includeRetired })
  return c.render(
    <CareerDataPage activeTab={activeTab} includeRetired={includeRetired} view={view} />,
  )
})
