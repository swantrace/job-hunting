export const workspaceTabs = ['application', 'contacts', 'activity', 'documents', 'review'] as const
export type WorkspaceTab = (typeof workspaceTabs)[number]

export const workspaceTabLabels: Record<WorkspaceTab, string> = {
  application: 'Application',
  contacts: 'Contacts',
  activity: 'Activity',
  documents: 'Documents',
  review: 'Review',
}
