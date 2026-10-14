/**
 * Subnavigation for the Career Data section. Steps 8-10 append their own tabs to
 * this registry; the section owns its navigation instead of adding a dozen
 * sidebar items. Tab links are bookmarkable, and the `oob` variant lets a
 * mutation refresh the active-tab state without losing the current tab.
 */
export const careerDataTabs = [
  { key: 'identity', label: 'Identity' },
  { key: 'experience', label: 'Experience' },
  { key: 'education', label: 'Education' },
] as const

export type CareerDataTab = (typeof careerDataTabs)[number]['key']

/** Unknown or forged query values fall back to the first tab. */
export function parseCareerDataTab(value: string | null | undefined): CareerDataTab {
  const match = careerDataTabs.find((tab) => tab.key === value)
  return match ? match.key : 'identity'
}

export function CareerDataTabs({
  activeTab,
  oob = false,
}: {
  activeTab: CareerDataTab
  oob?: boolean
}) {
  return (
    <nav
      id="career-data-tabs"
      aria-label="Career data sections"
      class="tabs tabs-box mb-4"
      {...(oob ? { 'hx-swap-oob': 'outerHTML' } : {})}
    >
      {careerDataTabs.map((tab) => {
        const active = tab.key === activeTab
        const href = `/career-data/${tab.key}`
        return (
          <a
            id={`career-data-tab-${tab.key}`}
            href={href}
            class={`tab whitespace-nowrap ${active ? 'tab-active' : ''}`}
            aria-current={active ? 'page' : undefined}
            hx-get={href}
            hx-target="#career-data-section"
            hx-swap="outerHTML"
            hx-push-url={href}
          >
            {tab.label}
          </a>
        )
      })}
    </nav>
  )
}
