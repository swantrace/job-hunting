import { type Filters, listApplications } from '../../../src/db/queries'
import { latestAnalysisBatchId } from '../../../src/lib/analysis/batch'
import { Board, Filters as FiltersForm, WorkspaceDrawer } from '../dashboard/Dashboard'
import { AppShell } from '../layout/AppShell'
import { Icon } from '../ui/Icon'
import { AiParserModal } from './AiParserModal'
import { BatchAnalysisStatus } from './BatchAnalysisStatus'
import { QuickCollectDrawer } from './QuickCollectDrawer'

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
          <BatchAnalysisStatus batchId={latestAnalysisBatchId()} />
          <Board jobs={jobs} filters={filters} />
        </QuickCollectDrawer>
      </WorkspaceDrawer>
      <AiParserModal filters={filters} />
    </AppShell>
  )
}
