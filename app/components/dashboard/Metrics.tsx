import type { JobStatus } from '../../../src/db/schema'

const activeStatuses: JobStatus[] = ['Saved', 'Apply Today', 'Applied', 'Follow Up', 'Interviewing']

export function Metrics({
  values,
  oob = false,
}: {
  values: Partial<Record<JobStatus, number>>
  oob?: boolean
}) {
  return (
    <div
      id="metrics"
      class="stats stats-horizontal w-full overflow-x-auto bg-base-100 shadow-sm"
      {...(oob ? { 'hx-swap-oob': 'outerHTML' } : {})}
    >
      {activeStatuses.map((status) => (
        <div class="stat px-4 py-3">
          <div class="stat-title text-xs">{status}</div>
          <div class="stat-value text-2xl">{values[status] ?? 0}</div>
        </div>
      ))}
    </div>
  )
}
