import type { Child } from 'hono/jsx'
import { AppNavigation } from './AppNavigation'
import { PageHeader } from './PageHeader'

/**
 * The single application-level layout. It owns navigation only — it is never an
 * HTMX mutation target and never receives OOB swaps. Route mutation envelopes
 * must not rerender this shell.
 */
export function AppShell({
  title,
  description,
  actions,
  children,
}: {
  title: string
  description?: string
  actions?: Child
  children: Child
}) {
  return (
    <div class="drawer lg:drawer-open">
      <input id="app-nav-toggle" type="checkbox" class="drawer-toggle" />
      <div class="drawer-content min-h-screen">
        <header class="navbar border-b border-base-300 bg-base-100 lg:hidden">
          <div class="flex-none">
            <label
              for="app-nav-toggle"
              aria-label="Open navigation"
              class="btn btn-ghost btn-square drawer-button"
            >
              ☰
            </label>
          </div>
          <div class="flex-1 px-2">
            <span class="text-lg font-bold">{title}</span>
          </div>
        </header>
        <main class="mx-auto max-w-[1800px] p-4 lg:p-7">
          <div class="hidden lg:block">
            <PageHeader title={title} description={description} actions={actions} />
          </div>
          {children}
        </main>
      </div>
      <div class="drawer-side z-40">
        <label for="app-nav-toggle" aria-label="Close navigation" class="drawer-overlay"></label>
        <aside class="min-h-full w-72 bg-base-200 p-4">
          <AppNavigation />
        </aside>
      </div>
    </div>
  )
}
