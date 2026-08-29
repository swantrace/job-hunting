import type { Child } from 'hono/jsx'

export function WorkspaceDrawer({ children, drawer }: { children: Child; drawer?: Child }) {
  return (
    <div class="drawer drawer-end">
      <input id="workspace-toggle" type="checkbox" class="drawer-toggle" />
      <div class="drawer-content">{children}</div>
      <div class="drawer-side z-40">
        <label for="workspace-toggle" aria-label="Close workspace" class="drawer-overlay" />
        <aside class="min-h-full w-full bg-base-100 p-5 sm:w-2xl">
          <div id="drawer-content">
            {drawer ?? <p class="text-base-content/60">Select an application.</p>}
          </div>
        </aside>
      </div>
    </div>
  )
}
