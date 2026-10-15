import type { CareerDataView } from '../../../src/db/career-data-view'
import { extensionObjectOrNull } from '../../../src/lib/career/json-schemas'
import { AppShell } from '../layout/AppShell'
import { AchievementSection } from './AchievementSection'
import { CareerDataSection } from './CareerDataSection'
import { type CareerDataTab, CareerDataTabs } from './CareerDataTabs'
import { EducationSection } from './EducationSection'
import { ExperienceSection } from './ExperienceSection'
import { IdentitySection } from './IdentitySection'
import { PortfolioSection } from './PortfolioSection'
import { PreferencesSection } from './PreferencesSection'
import { ProjectSection } from './ProjectSection'
import { PublicationSection } from './PublicationSection'
import { SkillsSection } from './SkillsSection'
import type { SkillView } from './SkillViewTabs'
import { StorySection } from './StorySection'

/** The panel content for one active tab, rendered by the page and section routes. */
function renderActiveSection(
  activeTab: CareerDataTab,
  includeRetired: boolean,
  skillsView: SkillView,
  view: CareerDataView,
) {
  switch (activeTab) {
    case 'experience':
      return <ExperienceSection experiences={view.experiences} includeRetired={includeRetired} />
    case 'education':
      return <EducationSection education={view.education} includeRetired={includeRetired} />
    case 'achievements':
      return (
        <AchievementSection
          achievements={view.achievements}
          includeRetired={includeRetired}
          experiences={view.allExperiences}
          catalogSkills={view.catalogSkills}
          publications={view.allPublications}
          directions={view.allDirections}
        />
      )
    case 'projects':
      return (
        <ProjectSection
          projects={view.projects}
          includeRetired={includeRetired}
          experiences={view.allExperiences}
          catalogSkills={view.catalogSkills}
          directions={view.allDirections}
        />
      )
    case 'skills':
      return (
        <SkillsSection
          view={skillsView}
          personalSkills={view.personalSkills}
          catalogSkills={view.catalogSkills}
          includeRetired={includeRetired}
        />
      )
    case 'stories':
      return (
        <StorySection
          stories={view.stories}
          includeRetired={includeRetired}
          experiences={view.allExperiences}
          directions={view.allDirections}
        />
      )
    case 'publications':
      return (
        <PublicationSection
          publications={view.publications}
          includeRetired={includeRetired}
          experiences={view.allExperiences}
          projects={view.allProjects}
          directions={view.allDirections}
        />
      )
    case 'portfolio':
      return (
        <PortfolioSection
          topics={view.portfolioTopics}
          includeRetired={includeRetired}
          projects={view.allProjects}
          directions={view.allDirections}
        />
      )
    case 'preferences':
      return (
        <PreferencesSection
          preferences={view.preferences}
          extensions={extensionObjectOrNull(view.extensionRecords.preferences?.['$'])}
        />
      )
    default:
      return <IdentitySection candidate={view.candidate} extensions={view.candidateExtensions} />
  }
}

/**
 * Full Career Data page. It is the only place the AppShell is rendered for this
 * section; every section route returns the same panel content as a fragment when
 * HTMX asks for it, so the shell is never duplicated inside a swap.
 */
export function CareerDataPage({
  activeTab,
  includeRetired,
  view,
  skillsView = 'mine',
}: {
  activeTab: CareerDataTab
  includeRetired: boolean
  view: CareerDataView
  skillsView?: SkillView
}) {
  return (
    <AppShell title="Career data" currentPath="/career-data">
      <CareerDataTabs activeTab={activeTab} />
      <CareerDataSection activeTab={activeTab} onboardingRequired={view.onboardingRequired}>
        {renderActiveSection(activeTab, includeRetired, skillsView, view)}
      </CareerDataSection>
    </AppShell>
  )
}
