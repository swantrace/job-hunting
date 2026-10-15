import { createRoute } from 'honox/factory'
import { loadCareerDataView } from '../../../../src/db/career-data-view'
import { db } from '../../../../src/db/client'
import { queryFlag } from '../../../../src/lib/request'
import { CareerDataPage } from '../../../components/career/CareerDataPage'
import { CareerDataSection } from '../../../components/career/CareerDataSection'
import { CareerDataTabs } from '../../../components/career/CareerDataTabs'
import { PublicationSection } from '../../../components/career/PublicationSection'

/** Publications tab: full page without an HTMX request, section fragment with one. */
export default createRoute((c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const view = loadCareerDataView(db, { includeRetired })
  if (c.req.header('HX-Request') !== 'true')
    return c.render(
      <CareerDataPage activeTab="publications" includeRetired={includeRetired} view={view} />,
    )
  return c.html(
    <>
      <CareerDataSection activeTab="publications" onboardingRequired={view.onboardingRequired}>
        <PublicationSection
          publications={view.publications}
          includeRetired={includeRetired}
          experiences={view.allExperiences}
          projects={view.allProjects}
          directions={view.allDirections}
        />
      </CareerDataSection>
      <CareerDataTabs activeTab="publications" oob />
    </>,
  )
})
