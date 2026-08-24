import type { Child } from 'hono/jsx'
import { AppNavigation } from './AppNavigation'

/**
 * The single application-level layout. It owns navigation (a collapsible sidebar
 * on desktop, an off-canvas drawer on mobile) and a fixed header carrying the
 * page title plus persistent Import/Export actions. It is never an HTMX target
 * and never receives OOB swaps.
 */
export function AppShell({
  title,
  currentPath = '/',
  children,
}: {
  title: string
  currentPath?: string
  children: Child
}) {
  return (
    <div class="min-h-screen lg:flex">
      <input id="app-nav-toggle" type="checkbox" class="peer/nav sr-only" />
      <aside class="fixed inset-y-0 left-0 z-40 w-72 -translate-x-full transform bg-base-200 p-4 transition-all duration-200 peer-checked/nav:translate-x-0 lg:static lg:z-auto lg:w-64 lg:translate-x-0 lg:transition-[width] lg:peer-checked/nav:w-0 lg:peer-checked/nav:overflow-hidden lg:peer-checked/nav:p-0">
        <AppNavigation currentPath={currentPath} />
      </aside>
      <div class="min-w-0 flex-1">
        <header class="navbar border-b border-base-300 bg-base-100">
          <div class="flex-none">
            <label
              for="app-nav-toggle"
              aria-label="Toggle navigation"
              class="btn btn-ghost btn-square"
            >
              ☰
            </label>
          </div>
          <div class="flex-1 px-2">
            <h1 class="truncate text-lg font-bold">{title}</h1>
          </div>
          <div class="flex-none gap-2">
            <a href="/import" class="btn btn-outline btn-sm">
              Import
            </a>
            <a href="/export" class="btn btn-outline btn-sm">
              Export
            </a>
          </div>
        </header>
        <main class="p-4 lg:p-7">{children}</main>
      </div>
    </div>
  )
}
