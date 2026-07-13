import { createRoute } from 'honox/factory'
import { listApplications, metrics } from '../../src/db/queries'
import { parseFilters } from '../../src/lib/request'
import { AppShell, Board, Filters, Metrics, QuickCollect } from '../components/Dashboard'

export default createRoute((c) => {
  const filters = parseFilters(c)
  return c.render(
    <AppShell>
      <main class="mx-auto min-h-screen max-w-[1800px] space-y-5 p-4 lg:p-7">
        <header>
          <p class="text-sm font-semibold uppercase tracking-[.2em] text-primary">Command center</p>
          <h1 class="text-3xl font-bold">Job Application Tracker</h1>
          <div class="mt-1 flex flex-wrap items-center gap-3">
            <p class="text-base-content/60">Keep every opportunity moving.</p>
            <div class="flex gap-3 text-sm">
              <a class="link link-primary" href="/manage">
                Manage data
              </a>
              <a class="link link-primary" href="/export">
                Export JSON
              </a>
              <a class="link link-primary" href="/import">
                Import JSON
              </a>
            </div>
          </div>
        </header>
        <Metrics values={metrics()} />
        <div class="grid gap-5 xl:grid-cols-[24rem_1fr]">
          <aside>
            <QuickCollect filters={filters} />
          </aside>
          <section class="space-y-5">
            <Filters filters={filters} />
            <Board jobs={listApplications(filters)} filters={filters} />
          </section>
        </div>
      </main>
    </AppShell>,
  )
})
