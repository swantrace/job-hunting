import { createRoute } from 'honox/factory'
import { loadCareerDataView } from '../../../../src/db/career-data-view'
import { db } from '../../../../src/db/client'
import {
  loadCareerTransferOptions,
  parseCareerTransferQuery,
} from '../../../../src/lib/career/transfer-options'
import { queryFlag } from '../../../../src/lib/request'
import { CareerDataPage } from '../../../components/career/CareerDataPage'
import { CareerDataSection } from '../../../components/career/CareerDataSection'
import { CareerDataTabs } from '../../../components/career/CareerDataTabs'
import { CareerTransferSection } from '../../../components/career/CareerTransferSection'

/**
 * Import & export tab: the portable career dataset, the legacy directory import
 * and the ChatGPT JSON context. Full page without an HTMX request, section
 * fragment with one, matching every other career-data tab.
 */
export default createRoute((c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const query = parseCareerTransferQuery((name) => c.req.query(name))
  const view = loadCareerDataView(db, { includeRetired })
  const transfer = loadCareerTransferOptions(db, query)
  if (c.req.header('HX-Request') !== 'true')
    return c.render(
      <CareerDataPage
        activeTab="transfer"
        includeRetired={includeRetired}
        view={view}
        transfer={transfer}
      />,
    )
  return c.html(
    <>
      <CareerDataSection activeTab="transfer" onboardingRequired={view.onboardingRequired}>
        <CareerTransferSection {...transfer} />
      </CareerDataSection>
      <CareerDataTabs activeTab="transfer" oob />
    </>,
  )
})
