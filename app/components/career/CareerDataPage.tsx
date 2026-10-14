import type { CareerDataView } from '../../../src/db/career-data-view'
import { AppShell } from '../layout/AppShell'
import { CareerDataSection } from './CareerDataSection'
import { type CareerDataTab, CareerDataTabs } from './CareerDataTabs'
import { EducationSection } from './EducationSection'
import { ExperienceSection } from './ExperienceSection'
import { IdentitySection } from './IdentitySection'

/**
 * Full Career Data page. It is the only place the AppShell is rendered for this
 * section; every section route returns the same panel content as a fragment when
 * HTMX asks for it, so the shell is never duplicated inside a swap.
 */
export function CareerDataPage({
  activeTab,
  includeRetired,
  view,
}: {
  activeTab: CareerDataTab
  includeRetired: boolean
  view: CareerDataView
}) {
  return (
    <AppShell title="Career data" currentPath="/career-data">
      <CareerDataTabs activeTab={activeTab} />
      <CareerDataSection activeTab={activeTab} onboardingRequired={view.onboardingRequired}>
        {activeTab === 'experience' ? (
          <ExperienceSection experiences={view.experiences} includeRetired={includeRetired} />
        ) : activeTab === 'education' ? (
          <EducationSection education={view.education} includeRetired={includeRetired} />
        ) : (
          <IdentitySection candidate={view.candidate} extensions={view.candidateExtensions} />
        )}
      </CareerDataSection>
    </AppShell>
  )
}
