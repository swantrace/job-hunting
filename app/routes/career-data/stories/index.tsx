import { createRoute } from 'honox/factory'
import { loadCareerDataView } from '../../../../src/db/career-data-view'
import { db } from '../../../../src/db/client'
import { queryFlag } from '../../../../src/lib/request'
import { CareerDataPage } from '../../../components/career/CareerDataPage'
import { CareerDataSection } from '../../../components/career/CareerDataSection'
import { CareerDataTabs } from '../../../components/career/CareerDataTabs'
import { StorySection } from '../../../components/career/StorySection'

/** Stories tab: full page without an HTMX request, section fragment with one. */
export default createRoute((c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const view = loadCareerDataView(db, { includeRetired })
  if (c.req.header('HX-Request') !== 'true')
    return c.render(
      <CareerDataPage activeTab="stories" includeRetired={includeRetired} view={view} />,
    )
  return c.html(
    <>
      <CareerDataSection activeTab="stories" onboardingRequired={view.onboardingRequired}>
        <StorySection
          stories={view.stories}
          includeRetired={includeRetired}
          experiences={view.allExperiences}
          directions={view.allDirections}
        />
      </CareerDataSection>
      <CareerDataTabs activeTab="stories" oob />
    </>,
  )
})
