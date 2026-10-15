import { createRoute } from 'honox/factory'
import { loadCareerDataView } from '../../../../src/db/career-data-view'
import { db } from '../../../../src/db/client'
import { queryFlag } from '../../../../src/lib/request'
import { CareerDataPage } from '../../../components/career/CareerDataPage'
import { CareerDataSection } from '../../../components/career/CareerDataSection'
import { CareerDataTabs } from '../../../components/career/CareerDataTabs'
import { ProjectSection } from '../../../components/career/ProjectSection'

/** Projects tab: full page without an HTMX request, section fragment with one. */
export default createRoute((c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const view = loadCareerDataView(db, { includeRetired })
  if (c.req.header('HX-Request') !== 'true')
    return c.render(
      <CareerDataPage activeTab="projects" includeRetired={includeRetired} view={view} />,
    )
  return c.html(
    <>
      <CareerDataSection activeTab="projects" onboardingRequired={view.onboardingRequired}>
        <ProjectSection
          projects={view.projects}
          includeRetired={includeRetired}
          experiences={view.allExperiences}
          catalogSkills={view.catalogSkills}
          directions={view.allDirections}
        />
      </CareerDataSection>
      <CareerDataTabs activeTab="projects" oob />
    </>,
  )
})
