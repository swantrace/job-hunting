import type { Child } from 'hono/jsx'

export function SkillWorkspace({ children }: { children: Child }) {
  return (
    <div class="drawer drawer-end">
      <input id="skill-workspace-toggle" type="checkbox" class="drawer-toggle" />
      <div class="drawer-content">{children}</div>
      <div class="drawer-side z-40">
        <label for="skill-workspace-toggle" aria-label="Close" class="drawer-overlay"></label>
        <aside id="skill-workspace-shell" class="min-h-full w-full bg-base-100 p-5 sm:w-2xl">
          <div id="skill-workspace-panel">
            <p class="text-base-content/60">
              Select a skill to review its aliases, status, and usage.
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}
