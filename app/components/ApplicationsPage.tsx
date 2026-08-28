import { type Filters, listApplications } from '../../src/db/queries'
import { Board, Filters as FiltersForm, WorkspaceDrawer } from './Dashboard'
import { AppShell } from './layout/AppShell'
import { AiParserModal } from './opportunities/AiParserModal'
import { QuickCollectDrawer } from './opportunities/QuickCollectDrawer'
import { Icon } from './ui/Icon'

export function ApplicationsPage({ filters }: { filters: Filters }) {
  const jobs = listApplications(filters)
  return (
    <AppShell
      title="Applications"
      currentPath="/applications"
      actions={
        <>
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            data-open-quick-collect
            aria-label="Quick add an application"
          >
            <Icon name="plus" />
            <span class="hidden sm:inline">Quick add</span>
          </button>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            data-open-ai-modal
            aria-haspopup="dialog"
            aria-label="Parse a job post with AI"
          >
            <Icon name="sparkle" />
            <span class="hidden sm:inline">Parse job post</span>
          </button>
        </>
      }
    >
      <WorkspaceDrawer>
        <QuickCollectDrawer filters={filters}>
          <FiltersForm filters={filters} />
          <Board jobs={jobs} filters={filters} />
        </QuickCollectDrawer>
      </WorkspaceDrawer>
      <AiParserModal filters={filters} />
    </AppShell>
  )
}
