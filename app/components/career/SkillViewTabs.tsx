/**
 * Sub-navigation for the Skills tab. "My skills" (the candidate's own claims)
 * and "Catalog" (the shared approved vocabulary) are separate views, so a
 * catalog entry is never confused with a claimed personal skill. The links are
 * bookmarkable and swap the whole career-data section, preserving the active
 * tab and the retired filter.
 */
export const skillViews = [
  { key: 'mine', label: 'My skills' },
  { key: 'catalog', label: 'Catalog' },
] as const

export type SkillView = (typeof skillViews)[number]['key']

/** Unknown or forged view values fall back to the personal "My skills" view. */
export function parseSkillView(value: string | null | undefined): SkillView {
  const match = skillViews.find((view) => view.key === value)
  return match ? match.key : 'mine'
}

export function skillViewHref(view: SkillView, includeRetired: boolean): string {
  const query = new URLSearchParams({ view })
  if (includeRetired) query.set('showRetired', '1')
  return `/career-data/skills?${query.toString()}`
}

export function SkillViewTabs({
  activeView,
  includeRetired,
}: {
  activeView: SkillView
  includeRetired: boolean
}) {
  return (
    <nav id="career-skills-views" aria-label="Skill views" class="tabs tabs-box mb-3">
      {skillViews.map((view) => {
        const active = view.key === activeView
        const href = skillViewHref(view.key, includeRetired)
        return (
          <a
            id={`career-skills-view-${view.key}`}
            href={href}
            class={`tab whitespace-nowrap ${active ? 'tab-active' : ''}`}
            aria-current={active ? 'page' : undefined}
            hx-get={href}
            hx-target="#career-data-section"
            hx-swap="outerHTML"
            hx-push-url={href}
          >
            {view.label}
          </a>
        )
      })}
    </nav>
  )
}
