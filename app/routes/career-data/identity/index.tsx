import { createRoute } from 'honox/factory'
import { loadCareerDataView } from '../../../../src/db/career-data-view'
import { db } from '../../../../src/db/client'
import { CareerDataPage } from '../../../components/career/CareerDataPage'
import { CareerDataSection } from '../../../components/career/CareerDataSection'
import { CareerDataTabs } from '../../../components/career/CareerDataTabs'
import { IdentitySection } from '../../../components/career/IdentitySection'

/** Identity tab: full page without an HTMX request, section fragment with one. */
export default createRoute((c) => {
  const view = loadCareerDataView(db)
  if (c.req.header('HX-Request') !== 'true')
    return c.render(<CareerDataPage activeTab="identity" includeRetired={false} view={view} />)
  return c.html(
    <>
      <CareerDataSection activeTab="identity" onboardingRequired={view.onboardingRequired}>
        <IdentitySection candidate={view.candidate} extensions={view.candidateExtensions} />
      </CareerDataSection>
      <CareerDataTabs activeTab="identity" oob />
    </>,
  )
})
