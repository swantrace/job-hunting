import type { Child } from 'hono/jsx'

/**
 * Composes one main HTMX fragment with optional top-level OOB siblings. Routes
 * must return only the fragments they own; OOB nodes stay top-level siblings so
 * they are never extracted from nested content (nested OOB processing is off).
 */
export function MutationEnvelope({
  main,
  board,
  metrics,
  workspaceHeader,
  workspaceTabs,
  workspacePanel,
  flash,
}: {
  main: Child
  board?: Child
  metrics?: Child
  workspaceHeader?: Child
  workspaceTabs?: Child
  workspacePanel?: Child
  flash?: Child
}) {
  return (
    <>
      {main}
      {board}
      {metrics}
      {workspaceHeader}
      {workspaceTabs}
      {workspacePanel}
      {flash}
    </>
  )
}
