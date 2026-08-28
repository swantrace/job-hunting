import type { Child } from 'hono/jsx'
import type { Filters } from '../../../src/db/queries'
import { QuickCollect } from '../Dashboard'
import { Icon } from '../ui/Icon'

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
        <aside class="relative min-h-full w-full bg-base-100 p-5 pt-14 sm:w-[30rem]">
          <button
            type="button"
            class="btn btn-ghost btn-circle btn-sm absolute right-4 top-4"
            data-close-quick-collect
            aria-label="Close quick add"
          >
            <Icon name="close" />
          </button>
          <QuickCollect filters={filters} />
        </aside>
      </div>
    </div>
  )
}
