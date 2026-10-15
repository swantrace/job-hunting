import { createRoute } from 'honox/factory'
import { loadCareerDataView } from '../../../../src/db/career-data-view'
import { db } from '../../../../src/db/client'
import { queryFlag } from '../../../../src/lib/request'
import { CareerDataPage } from '../../../components/career/CareerDataPage'
import { CareerDataSection } from '../../../components/career/CareerDataSection'
import { CareerDataTabs } from '../../../components/career/CareerDataTabs'
import { SkillsSection } from '../../../components/career/SkillsSection'
import { parseSkillView } from '../../../components/career/SkillViewTabs'

/**
 * Skills tab: "My skills" and "Catalog" are separate views of the same section.
 * Full page without an HTMX request, section fragment with one.
 */
export default createRoute((c) => {
  const includeRetired = queryFlag(c.req.query('showRetired'))
  const skillsView = parseSkillView(c.req.query('view'))
  const view = loadCareerDataView(db, { includeRetired })
  if (c.req.header('HX-Request') !== 'true')
    return c.render(
      <CareerDataPage
        activeTab="skills"
        includeRetired={includeRetired}
        skillsView={skillsView}
        view={view}
      />,
    )
  return c.html(
    <>
      <CareerDataSection activeTab="skills" onboardingRequired={view.onboardingRequired}>
        <SkillsSection
          view={skillsView}
          personalSkills={view.personalSkills}
          catalogSkills={view.catalogSkills}
          includeRetired={includeRetired}
        />
      </CareerDataSection>
      <CareerDataTabs activeTab="skills" oob />
    </>,
  )
})
