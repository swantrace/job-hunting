import type { JobCardData } from '../../../src/db/queries'
import { Icon } from '../ui/Icon'
import { StatusBadge } from '../ui/StatusBadge'

export function WorkspaceHeader({ job, oob = false }: { job: JobCardData; oob?: boolean }) {
  return (
    <header
      id="workspace-header"
      class="mb-5 flex items-start justify-between"
      {...(oob ? { 'hx-swap-oob': 'outerHTML' } : {})}
    >
      <div>
        <p class="text-sm text-base-content/60">{job.companyName}</p>
        <h2 class="text-2xl font-bold">{job.jobTitle}</h2>
        <div class="mt-2">
          <StatusBadge status={job.status} />
        </div>
      </div>
      <label for="workspace-toggle" class="btn btn-circle btn-ghost" aria-label="Close">
        <Icon name="close" />
      </label>
    </header>
  )
}
