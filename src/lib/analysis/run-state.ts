export const analysisLifecycleStatuses = ['Queued', 'Processing', 'Completed', 'Failed'] as const
export type AnalysisLifecycleStatus = (typeof analysisLifecycleStatuses)[number]

/**
 * A minimal, status-agnostic view of one run, sufficient to classify freshness
 * without depending on SQLite iteration order. Callers build these from their
 * own run rows; the classifier sorts deterministically by descending id.
 */
export type AnalysisRunSummary = {
  id: number
  status: AnalysisLifecycleStatus
  inputHash: string | null
  schemaVersion: string | null
}

export type AnalysisRunState =
  | 'never-run'
  | 'queued'
  | 'processing'
  | 'failed'
  | 'current'
  | 'stale'
  | 'legacy'

export type AnalysisRunStateResult = {
  state: AnalysisRunState
  /** Newest run by id regardless of status; drives polling and failure display. */
  latest: AnalysisRunSummary | null
  /** Newest completed run regardless of freshness; stays readable when stale. */
  latestCompleted: AnalysisRunSummary | null
  /** Newest completed run whose input hash and schema contract match current inputs. */
  currentCompleted: AnalysisRunSummary | null
  /** Newest completed run when it does not match current inputs; null otherwise. */
  staleCompleted: AnalysisRunSummary | null
}

function isLegacy(run: AnalysisRunSummary): boolean {
  return run.schemaVersion === null || run.inputHash === null
}

/**
 * Pure, deterministic classification of a stage's run history.
 *
 * `currentInputHash` is the hash of the current upstream inputs (or null when
 * they cannot yet be computed). `supportedSchemaVersion` is the current schema
 * contract; completed runs with a different (or null) schema are never treated
 * as current. Legacy records with null schema/input identity are preserved and
 * surfaced distinctly, never reported as "never run".
 */
export function classifyAnalysisRunState(
  runs: AnalysisRunSummary[],
  currentInputHash: string | null,
  supportedSchemaVersion: string | null,
): AnalysisRunStateResult {
  const ordered = [...runs].sort((a, b) => b.id - a.id)
  const latest = ordered[0] ?? null
  const latestCompleted = ordered.find((run) => run.status === 'Completed') ?? null
  const currentCompleted =
    ordered.find(
      (run) =>
        run.status === 'Completed' &&
        run.inputHash !== null &&
        run.inputHash === currentInputHash &&
        run.schemaVersion !== null &&
        run.schemaVersion === supportedSchemaVersion,
    ) ?? null

  const staleCompleted =
    latestCompleted && !isLegacy(latestCompleted) && latestCompleted.id !== currentCompleted?.id
      ? latestCompleted
      : null

  let state: AnalysisRunState
  if (!latest) state = 'never-run'
  else if (latest.status === 'Queued') state = 'queued'
  else if (latest.status === 'Processing') state = 'processing'
  else if (latest.status === 'Failed') state = 'failed'
  else if (currentCompleted) state = 'current'
  else if (latestCompleted && isLegacy(latestCompleted)) state = 'legacy'
  else if (latestCompleted) state = 'stale'
  else state = 'failed'

  return { state, latest, latestCompleted, currentCompleted, staleCompleted }
}
