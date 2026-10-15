import { createRoute } from 'honox/factory'
import { loadCareerDataView } from '../../../../src/db/career-data-view'
import { db } from '../../../../src/db/client'
import { queryFlag } from '../../../../src/lib/request'
import { BaseResumeSection } from '../../../components/career/BaseResumeSection'
import { CareerDataPage } from '../../../components/career/CareerDataPage'
import { CareerDataSection } from '../../../components/career/CareerDataSection'
import { CareerDataTabs } from '../../../components/career/CareerDataTabs'

/** Base Resumes tab: full page without an HTMX request, section fragment with one. */
export default createRoute((c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const view = loadCareerDataView(db, { includeRetired })
  if (c.req.header('HX-Request') !== 'true')
    return c.render(
      <CareerDataPage activeTab="base-resumes" includeRetired={includeRetired} view={view} />,
    )
  return c.html(
    <>
      <CareerDataSection activeTab="base-resumes" onboardingRequired={view.onboardingRequired}>
        <BaseResumeSection
          directions={view.directions}
          versions={view.baseResumes}
          includeRetired={includeRetired}
        />
      </CareerDataSection>
      <CareerDataTabs activeTab="base-resumes" oob />
    </>,
  )
})
