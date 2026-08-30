import {
  type WorkspaceTab,
  workspaceTabLabels,
  workspaceTabs,
} from '../../../src/lib/workspace/constants'

export function WorkspaceTabs({ activeTab }: { activeTab: WorkspaceTab }) {
  return (
    <div id="workspace-tabs" role="tablist" class="tabs tabs-box mb-4">
      {workspaceTabs.map((tab) => {
        const active = tab === activeTab
        return (
          <button
            id={`workspace-tab-${tab}`}
            role="tab"
            class={`tab ${active ? 'tab-active' : ''}`}
            data-workspace-tab={tab}
            aria-selected={active ? 'true' : 'false'}
            aria-controls={`workspace-${tab}-panel`}
            tabindex={active ? 0 : -1}
          >
            {workspaceTabLabels[tab]}
          </button>
        )
      })}
    </div>
  )
}
