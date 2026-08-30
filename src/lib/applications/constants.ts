export const priorities = ['A', 'B', 'C'] as const
export type JobPriority = (typeof priorities)[number]

export const matchLevels = ['A', 'B'] as const
export type MatchLevel = (typeof matchLevels)[number]

export const statuses = [
  'Saved',
  'Apply Today',
  'Applied',
  'Follow Up',
  'Interviewing',
  'Rejected',
  'Archived',
] as const
export type JobStatus = (typeof statuses)[number]

export const activeStatuses = [
  'Saved',
  'Apply Today',
  'Applied',
  'Follow Up',
  'Interviewing',
] as const satisfies readonly JobStatus[]

export const applicationViews = ['list', 'board'] as const
export type ApplicationView = (typeof applicationViews)[number]

export const applicationViewLabels: Record<ApplicationView, string> = {
  list: 'List',
  board: 'Board',
}

export const applicationSortValues = [
  'updated_desc',
  'posted_desc',
  'posted_asc',
  'company_asc',
  'company_desc',
  'priority_asc',
  'priority_desc',
  'target_asc',
  'applied_desc',
  'applied_asc',
] as const
export type ApplicationSort = (typeof applicationSortValues)[number]

export const applicationSortLabels: Record<ApplicationSort, string> = {
  updated_desc: 'Recently updated',
  posted_desc: 'Posted: newest',
  posted_asc: 'Posted: oldest',
  company_asc: 'Company: A-Z',
  company_desc: 'Company: Z-A',
  priority_asc: 'Priority: A-C',
  priority_desc: 'Priority: C-A',
  target_asc: 'Today target',
  applied_desc: 'Applied: newest',
  applied_asc: 'Applied: oldest',
}
