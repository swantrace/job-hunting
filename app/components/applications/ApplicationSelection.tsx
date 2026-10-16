import type { JobCardData } from '../../../src/db/queries'

export function ApplicationSelection({ job }: { job: JobCardData }) {
  return (
    <input
      type="checkbox"
      class="checkbox checkbox-sm shrink-0"
      name="applicationIds"
      value={job.id}
      data-application-selection
      aria-label={`Select ${job.jobTitle} at ${job.companyName}`}
    />
  )
}
