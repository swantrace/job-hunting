import type { JobCardData } from '../../../src/db/queries'

export function WorkspaceHeader({ job }: { job: JobCardData }) {
  return (
    <header id="workspace-header" class="mb-5 flex items-start justify-between">
      <div>
        <p class="text-sm text-base-content/60">{job.companyName}</p>
        <h2 class="text-2xl font-bold">{job.jobTitle}</h2>
        <span class="badge badge-primary mt-2">{job.status}</span>
      </div>
      <label for="workspace-toggle" class="btn btn-circle btn-ghost" aria-label="Close">
        ✕
      </label>
    </header>
  )
}
