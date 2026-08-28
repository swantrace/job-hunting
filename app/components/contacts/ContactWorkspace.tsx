import type { Child } from 'hono/jsx'

export function ContactWorkspace({ children }: { children: Child }) {
  return (
    <div class="drawer drawer-end">
      <input id="contact-workspace-toggle" type="checkbox" class="drawer-toggle" />
      <div class="drawer-content">{children}</div>
      <div class="drawer-side z-40">
        <label for="contact-workspace-toggle" aria-label="Close" class="drawer-overlay"></label>
        <aside id="contact-workspace-shell" class="min-h-full w-full bg-base-100 p-5 sm:w-2xl">
          <div id="contact-workspace-panel">
            <p class="text-base-content/60">
              Select a contact to review its applications and activity.
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}
