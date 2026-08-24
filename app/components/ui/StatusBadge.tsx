import type { JobStatus } from '../../../src/db/schema'

const tones: Record<JobStatus, string> = {
  Saved: 'badge-ghost',
  'Apply Today': 'badge-info',
  Applied: 'badge-primary',
  'Follow Up': 'badge-warning',
  Interviewing: 'badge-success',
  Rejected: 'badge-error',
  Archived: 'badge-neutral',
}

export function StatusBadge({ status }: { status: JobStatus }) {
  return <span class={`badge ${tones[status]}`}>{status}</span>
}
