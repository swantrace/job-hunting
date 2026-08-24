import { type Filters, listApplications, metrics } from '../../src/db/queries'
import { Board, Filters as FiltersForm, Metrics, WorkspaceDrawer } from './Dashboard'
import { AppShell } from './layout/AppShell'
import { AiParserModal } from './opportunities/AiParserModal'
import { QuickCollectDrawer } from './opportunities/QuickCollectDrawer'

export function DashboardPage({ filters }: { filters: Filters }) {
  return (
    <AppShell title="Job Application Tracker" description="Keep every opportunity moving.">
      <WorkspaceDrawer>
        <QuickCollectDrawer filters={filters}>
          <Metrics values={metrics()} />
          <FiltersForm filters={filters} />
          <Board jobs={listApplications(filters)} filters={filters} />
        </QuickCollectDrawer>
      </WorkspaceDrawer>
      <AiParserModal filters={filters} />
    </AppShell>
  )
}
