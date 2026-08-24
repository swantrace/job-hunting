import type { Child } from 'hono/jsx'
import type { Filters } from '../../../src/db/queries'
import { QuickCollect } from '../Dashboard'

export function QuickCollectDrawer({ filters, children }: { filters: Filters; children: Child }) {
  return (
    <div class="drawer drawer-end">
      <input id="quick-collect-toggle" type="checkbox" class="drawer-toggle" />
      <div class="drawer-content">{children}</div>
      <div class="drawer-side z-40">
        <label
          for="quick-collect-toggle"
          aria-label="Close quick collect"
          class="drawer-overlay"
        ></label>
        <aside class="min-h-full w-full bg-base-100 p-5 sm:w-[30rem]">
          <QuickCollect filters={filters} />
        </aside>
      </div>
    </div>
  )
}
