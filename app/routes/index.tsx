import { createRoute } from 'honox/factory'
import { listApplications, metrics } from '../../src/db/queries'
import { parseFilters } from '../../src/lib/request'
import { AiParser } from '../components/AiParser'
import { Board, Filters, Metrics, QuickCollect, WorkspaceDrawer } from '../components/Dashboard'
import { AppShell } from '../components/layout/AppShell'

export default createRoute((c) => {
  const filters = parseFilters(c)
  return c.render(
    <AppShell title="Job Application Tracker" description="Keep every opportunity moving.">
      <WorkspaceDrawer>
        <Metrics values={metrics()} />
        <div class="mt-5 grid gap-5 xl:grid-cols-[24rem_1fr]">
          <aside>
            <AiParser filters={filters} />
            <QuickCollect filters={filters} />
          </aside>
          <section class="space-y-5">
            <Filters filters={filters} />
            <Board jobs={listApplications(filters)} filters={filters} />
          </section>
        </div>
      </WorkspaceDrawer>
    </AppShell>,
  )
})
