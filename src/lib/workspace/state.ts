/**
 * Workspace progression model: the single source of truth for tab order,
 * labels, gating rules, and state-specific copy.
 *
 * These are the fixed product decisions from the plan. The order and labels
 * here become the canonical values consumed by `src/lib/workspace/constants.ts`
 * in the workspace-tab implementation step; the UI reads them through these
 * pure functions so availability and copy are never recomputed ad hoc in JSX.
 */
export const workspaceTabOrder = [
  'application',
  'review',
  'documents',
  'contacts',
  'activity',
] as const
export type WorkspaceTab = (typeof workspaceTabOrder)[number]

export const workspaceTabLabels: Record<WorkspaceTab, string> = {
  application: 'Job Post',
  review: 'Review',
  documents: 'Documents',
  contacts: 'Contact',
  activity: 'Activities',
}

/** Stable workspace fragment boundaries; never render duplicate IDs in a page. */
export const workspaceBoundaryIds = [
  'workspace-shell',
  'workspace-tabs',
  'workspace-job-analysis-status',
  'workspace-review-panel',
  'analysis-run-status',
  'requirement-readiness',
  'workspace-documents-panel',
  'generation-panel',
] as const
export type WorkspaceBoundaryId = (typeof workspaceBoundaryIds)[number]

export type WorkspaceAvailability = {
  /** A current structured Job Analysis has completed. */
  jobAnalysisCurrent: boolean
  /** The current Review is ready: current Candidate Analysis, confirmed profile, all decisions. */
  reviewReady: boolean
  /** A historical (stale/legacy) Candidate Analysis exists and stays viewable. */
  hasHistoricalReview: boolean
  /** Historical completed Documents exist and stay viewable. */
  hasHistoricalDocuments: boolean
}

export type TabAvailability = {
  key: WorkspaceTab
  label: string
  enabled: boolean
  lockedReason: string | null
}

export const reviewLockedReason = 'Complete a current job analysis to open this review.'
export const documentsLockedReason = 'Complete the current review before generating documents.'

export function isTabEnabled(key: WorkspaceTab, state: WorkspaceAvailability): boolean {
  switch (key) {
    case 'application':
    case 'contacts':
    case 'activity':
      return true
    case 'review':
      return state.jobAnalysisCurrent || state.hasHistoricalReview
    case 'documents':
      return state.reviewReady || state.hasHistoricalDocuments
  }
}

export function tabAvailability(state: WorkspaceAvailability): TabAvailability[] {
  return workspaceTabOrder.map((key) => {
    const enabled = isTabEnabled(key, state)
    return {
      key,
      label: workspaceTabLabels[key],
      enabled,
      lockedReason: enabled ? null : key === 'review' ? reviewLockedReason : documentsLockedReason,
    }
  })
}

export function isWorkspaceTab(value: unknown): value is WorkspaceTab {
  return typeof value === 'string' && (workspaceTabOrder as readonly string[]).includes(value)
}

/**
 * Resolves the active tab server-side. Unknown keys and forged locked tabs
 * fall back to the always-available Job Post tab.
 */
export function resolveWorkspaceTab(
  requested: unknown,
  state: WorkspaceAvailability,
): WorkspaceTab {
  const key = isWorkspaceTab(requested) ? requested : 'application'
  return isTabEnabled(key, state) ? key : 'application'
}

export type ReviewGateState =
  | 'never-run'
  | 'legacy'
  | 'stale'
  | 'queued'
  | 'processing'
  | 'failed'
  | 'current'

export type ReviewGateCopy = {
  state: ReviewGateState
  heading: string
  message: string
  actionLabel: string
}

/**
 * State-specific Review copy. A legacy analysis must read as outdated with a
 * rerun action, never as "never analyzed".
 */
export function reviewGateCopy(state: ReviewGateState): ReviewGateCopy {
  switch (state) {
    case 'never-run':
      return {
        state,
        heading: 'Review not started',
        message: 'Run a job analysis to unlock this review.',
        actionLabel: 'Analyze job post',
      }
    case 'legacy':
      return {
        state,
        heading: 'Outdated analysis',
        message: 'This job analysis predates the current workflow and is outdated.',
        actionLabel: 'Re-run analysis',
      }
    case 'stale':
      return {
        state,
        heading: 'Outdated review',
        message: 'Upstream inputs changed after this review was completed.',
        actionLabel: 'Re-run review',
      }
    case 'queued':
      return {
        state,
        heading: 'Analysis queued',
        message: 'The analysis is queued.',
        actionLabel: '',
      }
    case 'processing':
      return { state, heading: 'Analyzing', message: 'The analysis is running.', actionLabel: '' }
    case 'failed':
      return {
        state,
        heading: 'Analysis failed',
        message: 'The latest attempt failed; a previous result may still be available.',
        actionLabel: 'Retry',
      }
    case 'current':
      return { state, heading: 'Review ready', message: 'This review is current.', actionLabel: '' }
  }
}
