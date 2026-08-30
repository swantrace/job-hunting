import {
  type TabAvailability,
  type WorkspaceTab,
  workspaceTabLabels,
  workspaceTabOrder,
} from '../../../src/lib/workspace/state'

export function WorkspaceTabs({
  activeTab,
  availability,
  oob = false,
}: {
  activeTab: WorkspaceTab
  availability: TabAvailability[]
  oob?: boolean
}) {
  const byKey = new Map(availability.map((tab) => [tab.key, tab]))
  return (
    <div
      id="workspace-tabs"
      role="tablist"
      class="tabs tabs-box mb-4"
      {...(oob ? { 'hx-swap-oob': 'outerHTML' } : {})}
    >
      {workspaceTabOrder.map((key) => {
        const tab = byKey.get(key) ?? {
          key,
          label: workspaceTabLabels[key],
          enabled: false,
          lockedReason: null,
        }
        const active = key === activeTab
        return (
          <button
            id={`workspace-tab-${key}`}
            role="tab"
            class={`tab ${active ? 'tab-active' : ''}`}
            data-workspace-tab={key}
            aria-selected={active ? 'true' : 'false'}
            aria-controls={`workspace-${key}-panel`}
            aria-disabled={tab.enabled ? 'false' : 'true'}
            disabled={!tab.enabled}
            title={tab.lockedReason ?? undefined}
            tabindex={active ? 0 : -1}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
