import { db } from '../../../src/db/client'
import {
  getJobAnalysisState,
  type JobAnalysisRun,
  listJobAnalysisRuns,
} from '../../../src/db/job-analysis-runs'
import type { Filters, JobCardData } from '../../../src/db/queries'
import type { AnalysisRunState } from '../../../src/lib/analysis-run-state'
import { currentJobAnalysisHash } from '../../../src/lib/job-analysis-input'
import { query } from './helpers'

function actionLabel(state: AnalysisRunState): string {
  switch (state) {
    case 'never-run':
      return 'Analyze job post'
    case 'current':
      return 'Re-run current'
    case 'legacy':
      return 'Upgrade legacy analysis'
    case 'stale':
      return 'Upgrade outdated analysis'
    case 'failed':
      return 'Retry analysis'
    default:
      return 'Analyze job post'
  }
}

function statusClass(status: string) {
  if (status === 'Completed') return 'badge-success'
  if (status === 'Failed') return 'badge-error'
  if (status === 'Processing') return 'badge-warning'
  return 'badge-info'
}

function RunRow({ run }: { run: JobAnalysisRun }) {
  return (
    <li class="flex flex-wrap items-center gap-2 text-xs text-base-content/70">
      <span class="font-mono">#{run.id}</span>
      <span class={`badge badge-sm ${statusClass(run.status)}`}>{run.status}</span>
      {run.schemaVersion ? <span>schema {run.schemaVersion}</span> : null}
      {run.model ? <span>{run.model}</span> : null}
      {(run.completedAt ?? run.createdAt) ? <span>{run.completedAt ?? run.createdAt}</span> : null}
    </li>
  )
}

export function JobAnalysisStatus({
  job,
  filters,
  oob = false,
}: {
  job: JobCardData
  filters: Filters
  oob?: boolean
}) {
  const posting = job.jobPosting
  const postingId = posting?.id ?? null
  const currentHash = postingId ? currentJobAnalysisHash(db, postingId) : null
  const state = postingId ? getJobAnalysisState(db, postingId, currentHash) : null
  const runs = postingId ? listJobAnalysisRuns(db, postingId) : []
  const latest = state?.latest ?? null
  const info = state?.currentCompleted ?? state?.latestCompleted ?? null
  const shouldPoll = latest?.status === 'Queued' || latest?.status === 'Processing'

  return (
    <section
      id="workspace-job-analysis-status"
      class="rounded-box border border-base-300 p-4"
      aria-live="polite"
      {...(oob ? { 'hx-swap-oob': 'outerHTML' } : {})}
      {...(shouldPoll
        ? {
            'hx-get': `/applications/${job.id}/job-analysis-runs?${query(filters)}`,
            'hx-trigger': 'every 2s',
            'hx-swap': 'outerHTML',
          }
        : {})}
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 class="font-semibold">Job post analysis</h3>
          <p class="text-sm text-base-content/60">
            Analyze the saved job post into a structured, candidate-independent role analysis.
          </p>
        </div>
        {postingId ? (
          <form
            hx-post={`/applications/${job.id}/job-analysis-runs?${query(filters)}`}
            hx-target="#workspace-job-analysis-status"
            hx-swap="outerHTML"
            hx-disabled-elt="find button"
          >
            <button class="btn btn-secondary btn-sm" disabled={shouldPoll}>
              {shouldPoll ? <span class="loading loading-spinner loading-xs" /> : null}
              {actionLabel(state?.state ?? 'never-run')}
            </button>
          </form>
        ) : null}
      </div>

      {!posting ? (
        <div class="alert mt-4 text-sm">
          <span>Save a job post before running an analysis.</span>
        </div>
      ) : null}

      {posting && !info ? (
        <div class="alert alert-info mt-4 text-sm" role="alert">
          {latest?.status === 'Failed'
            ? 'The latest analysis attempt failed. Retry it below.'
            : 'No job analysis has been completed yet.'}
        </div>
      ) : null}

      {info ? (
        <div class="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span class={`badge ${statusClass(info.status)}`}>{info.status}</span>
          {info.model ? <span class="text-base-content/60">Model: {info.model}</span> : null}
          {info.promptVersion ? (
            <span class="text-base-content/60">Prompt: {info.promptVersion}</span>
          ) : null}
          {info.schemaVersion ? (
            <span class="text-base-content/60">Schema: {info.schemaVersion}</span>
          ) : null}
          {(info.completedAt ?? info.createdAt) ? (
            <span class="text-base-content/60">Date: {info.completedAt ?? info.createdAt}</span>
          ) : null}
          {info.schemaVersion == null ? (
            <span class="badge badge-warning badge-sm">Legacy</span>
          ) : null}
        </div>
      ) : null}

      {latest && latest.id !== info?.id ? (
        <div class="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span class="text-base-content/60">Latest attempt:</span>
          <span class={`badge ${statusClass(latest.status)}`}>{latest.status}</span>
          {latest.errorMessage ? <span class="text-error">{latest.errorMessage}</span> : null}
        </div>
      ) : null}

      {runs.length ? (
        <details class="mt-4 text-sm">
          <summary class="cursor-pointer font-semibold">Analysis history ({runs.length})</summary>
          <ul class="mt-2 list-inside space-y-1">
            {runs.map((run) => (
              <RunRow run={run} />
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  )
}
