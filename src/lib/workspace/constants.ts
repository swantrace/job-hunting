// Workspace tab order and labels are centralized in `./state` so availability,
// labels, and locked reasons never diverge. Re-exported here for the existing
// `workspaceTabs`/`workspaceTabLabels` import sites.

export type { WorkspaceTab } from './state'
export { workspaceTabLabels, workspaceTabOrder as workspaceTabs } from './state'
