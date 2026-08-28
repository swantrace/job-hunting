import type { WorkspaceTab } from '../../../src/lib/validation'

const tabs: { id: WorkspaceTab; label: string }[] = [
  { id: 'application', label: 'Application' },
  { id: 'contacts', label: 'Contacts' },
  { id: 'activity', label: 'Activity' },
  { id: 'documents', label: 'Documents' },
  { id: 'review', label: 'Review' },
]

export function WorkspaceTabs({ activeTab }: { activeTab: WorkspaceTab }) {
  return (
    <div id="workspace-tabs" role="tablist" class="tabs tabs-box mb-4">
      {tabs.map((tab) => {
        const active = tab.id === activeTab
        return (
          <button
            id={`workspace-tab-${tab.id}`}
            role="tab"
            class={`tab ${active ? 'tab-active' : ''}`}
            data-workspace-tab={tab.id}
            aria-selected={active ? 'true' : 'false'}
            aria-controls={`workspace-${tab.id}-panel`}
            tabindex={active ? 0 : -1}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
