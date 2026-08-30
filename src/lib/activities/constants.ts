export const followUpActionTypes = ['email', 'linkedin', 'phone', 'reminder', 'other'] as const
export type FollowUpActionType = (typeof followUpActionTypes)[number]

export const interviewRoundTypes = [
  'screening',
  'technical',
  'behavioral',
  'system-design',
  'hiring-manager',
  'final',
  'other',
] as const
export type InterviewRoundType = (typeof interviewRoundTypes)[number]
