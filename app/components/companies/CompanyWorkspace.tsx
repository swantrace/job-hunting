import type { Child } from 'hono/jsx'

export function CompanyWorkspace({ children }: { children: Child }) {
  return (
    <div class="drawer drawer-end">
      <input id="company-workspace-toggle" type="checkbox" class="drawer-toggle" />
      <div class="drawer-content">{children}</div>
      <div class="drawer-side z-40">
        <label for="company-workspace-toggle" aria-label="Close" class="drawer-overlay"></label>
        <aside id="company-workspace-shell" class="min-h-full w-full bg-base-100 p-5 sm:w-2xl">
          <div id="company-workspace-panel">
            <p class="text-base-content/60">
              Select a company to review its applications and contacts.
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}
