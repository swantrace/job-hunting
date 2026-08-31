import type { ApplicationAnalysisRun } from '../../../src/db/analysis'
import type { Filters } from '../../../src/db/queries'
import { query } from './helpers'

export function AnalysisRunStatus({
  jobId,
  filters,
  run,
  hasCurrentJobAnalysis,
  oob = false,
}: {
  jobId: number
  filters: Filters
  run: ApplicationAnalysisRun | null
  hasCurrentJobAnalysis: boolean
  oob?: boolean
}) {
  const statusClass =
    run?.status === 'Completed'
      ? 'badge-success'
      : run?.status === 'Failed'
        ? 'badge-error'
        : run?.status === 'Processing'
          ? 'badge-warning'
          : 'badge-info'
  const shouldPoll = run?.status === 'Queued' || run?.status === 'Processing'
  return (
    <section
      id="analysis-run-status"
      class="rounded-box border border-base-300 p-4"
      aria-live="polite"
      {...(oob ? { 'hx-swap-oob': 'outerHTML' } : {})}
      {...(shouldPoll
        ? {
            'hx-get': `/applications/${jobId}/analysis-runs?${query(filters)}`,
            'hx-trigger': 'every 2s',
            'hx-swap': 'outerHTML',
          }
        : {})}
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 class="font-semibold">Candidate analysis</h3>
          <p class="text-sm text-base-content/60">
            Review the structured job analysis against your canonical career data.
          </p>
        </div>
        <form
          hx-post={`/applications/${jobId}/analysis-runs?${query(filters)}`}
          hx-target="#analysis-run-status"
          hx-swap="outerHTML"
          hx-disabled-elt="find button"
        >
          <button class="btn btn-secondary btn-sm" disabled={!hasCurrentJobAnalysis}>
            <span class="loading loading-spinner loading-xs htmx-indicator" />
            {run?.status === 'Failed'
              ? 'Re-analyze'
              : run
                ? 'Re-run analysis'
                : 'Analyze candidate'}
          </button>
        </form>
      </div>
      {!hasCurrentJobAnalysis ? (
        <div class="alert alert-warning mt-4 text-sm" role="alert">
          <span>Analyze the job post first before running candidate analysis.</span>
        </div>
      ) : null}
      {run ? (
        <div class="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span class={`badge ${statusClass}`}>{run.status}</span>
          {run.status === 'Queued' || run.status === 'Processing' ? (
            <span class="loading loading-spinner loading-xs" aria-hidden="true" />
          ) : null}
          <span class="text-base-content/60">Attempts: {run.attempts}</span>
          {run.model ? <span class="text-base-content/60">Model: {run.model}</span> : null}
        </div>
      ) : (
        <p class="mt-3 text-sm text-base-content/60">No candidate analysis has been run yet.</p>
      )}
      {run?.errorMessage ? (
        <div class="alert alert-error mt-3 text-sm">
          <span>{run.errorMessage}</span>
        </div>
      ) : null}
    </section>
  )
}
