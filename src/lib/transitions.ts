import type { JobStatus } from '../db/schema'

const rank: Partial<Record<JobStatus, number>> = {
  Saved: 0,
  'Apply Today': 1,
  Applied: 2,
  'Follow Up': 3,
  Interviewing: 4,
}

export function advanceStatus(
  current: JobStatus,
  requested: 'Follow Up' | 'Interviewing',
): JobStatus {
  if (current === 'Rejected' || current === 'Archived') return current
  return (rank[requested] ?? 0) > (rank[current] ?? 0) ? requested : current
}
