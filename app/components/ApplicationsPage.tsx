import { type Filters, listApplications } from '../../src/db/queries'
import { Board, Filters as FiltersForm, WorkspaceDrawer } from './Dashboard'
import { AppShell } from './layout/AppShell'
import { AiParserModal } from './opportunities/AiParserModal'
import { QuickCollectDrawer } from './opportunities/QuickCollectDrawer'

export function ApplicationsPage({ filters }: { filters: Filters }) {
  const jobs = listApplications(filters)
  return (
    <AppShell title="Applications" currentPath="/applications">
      <WorkspaceDrawer>
        <QuickCollectDrawer filters={filters}>
          <p class="mb-4 text-sm text-base-content/60">
            {jobs.length} application{jobs.length === 1 ? '' : 's'} found
          </p>
          <FiltersForm filters={filters} />
          <Board jobs={jobs} filters={filters} />
        </QuickCollectDrawer>
      </WorkspaceDrawer>
      <AiParserModal filters={filters} />
    </AppShell>
  )
}
