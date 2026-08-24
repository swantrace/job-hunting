import { type Filters, listApplications, metrics } from '../../src/db/queries'
import { AiParser } from './AiParser'
import { Board, Filters as FiltersForm, Metrics, QuickCollect, WorkspaceDrawer } from './Dashboard'
import { AppShell } from './layout/AppShell'

export function DashboardPage({ filters }: { filters: Filters }) {
  return (
    <AppShell title="Job Application Tracker" description="Keep every opportunity moving.">
      <WorkspaceDrawer>
        <Metrics values={metrics()} />
        <div class="mt-5 grid gap-5 xl:grid-cols-[24rem_1fr]">
          <aside>
            <AiParser filters={filters} />
            <QuickCollect filters={filters} />
          </aside>
          <section class="space-y-5">
            <FiltersForm filters={filters} />
            <Board jobs={listApplications(filters)} filters={filters} />
          </section>
        </div>
      </WorkspaceDrawer>
    </AppShell>
  )
}
