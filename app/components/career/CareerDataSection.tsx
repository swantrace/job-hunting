import type { Child } from 'hono/jsx'
import type { CareerDataTab } from './CareerDataTabs'
import { CareerOnboardingRegion } from './CareerOnboardingRegion'

/**
 * The stable career-data fragment root. Full pages and section fragments share
 * this wrapper, so the onboarding empty state and the active tab panel keep the
 * same boundary ids everywhere and a fragment never duplicates a page.
 */
export function CareerDataSection({
  activeTab,
  onboardingRequired,
  children,
}: {
  activeTab: CareerDataTab
  onboardingRequired: boolean
  children: Child
}) {
  return (
    <section id="career-data-section" aria-label="Career data" data-career-tab={activeTab}>
      <CareerOnboardingRegion onboardingRequired={onboardingRequired} />
      <div
        id={`career-data-${activeTab}-panel`}
        role="region"
        aria-labelledby={`career-data-tab-${activeTab}`}
      >
        {children}
      </div>
    </section>
  )
}
