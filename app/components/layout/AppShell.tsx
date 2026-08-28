import type { Child } from 'hono/jsx'
import { Icon } from '../ui/Icon'
import { AppNavigation } from './AppNavigation'

/**
 * The single application-level layout. It mirrors the ui-template shell: the
 * sidebar is persistent on desktop and becomes an off-canvas drawer on mobile.
 * The shell is never an HTMX target
 * and never receives OOB swaps.
 */
export function AppShell({
  title,
  currentPath = '/',
  actions,
  children,
}: {
  title: string
  currentPath?: string
  actions?: Child
  children: Child
}) {
  return (
    <div class="drawer min-h-screen bg-base-200 lg:drawer-open">
      <input
        id="app-nav-toggle"
        type="checkbox"
        class="drawer-toggle"
        aria-label="Toggle navigation"
      />
      <div class="drawer-content min-w-0 bg-base-100 lg:mt-2 lg:rounded-ss-4xl lg:border-s lg:border-t lg:border-base-300 lg:[corner-start-start-shape:squircle]">
        <header class="navbar min-h-16 px-3 sm:px-5 lg:px-8">
          <label
            for="app-nav-toggle"
            aria-label="Open navigation"
            class="btn btn-ghost btn-square drawer-button lg:hidden"
          >
            <Icon name="menu" className="size-5" />
          </label>
          <div class="min-w-0 flex-1 px-2">
            <h1 class="truncate text-xl font-bold">{title}</h1>
          </div>
          {actions ? <div class="flex flex-none items-center gap-2">{actions}</div> : null}
        </header>
        <main class="p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
      <aside class="drawer-side z-40">
        <label for="app-nav-toggle" aria-label="Close navigation" class="drawer-overlay"></label>
        <div class="min-h-full w-72 bg-base-200 p-4 pt-6 lg:w-64">
          <AppNavigation currentPath={currentPath} />
        </div>
      </aside>
    </div>
  )
}
