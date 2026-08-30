import type { Filters, JobCardData } from '../../../src/db/queries'
import { ApplicationForm } from './ApplicationForm'
import { JobAnalysisStatus } from './JobAnalysisStatus'
import { JobPostEditor } from './JobPostEditor'

export function ApplicationPanel({
  job,
  filters,
  active = false,
}: {
  job: JobCardData
  filters: Filters
  active?: boolean
}) {
  return (
    <div
      id="workspace-application-panel"
      role="tabpanel"
      aria-labelledby="workspace-tab-application"
      data-workspace-panel
      class={active ? '' : 'hidden'}
    >
      <h2 class="mb-3 text-lg font-semibold">Job Post</h2>
      <ApplicationForm job={job} filters={filters} />
      <div class="mt-6">
        <JobPostEditor job={job} filters={filters} />
      </div>
      <div class="mt-4">
        <JobAnalysisStatus job={job} filters={filters} />
      </div>
    </div>
  )
}
