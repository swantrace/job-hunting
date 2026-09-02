import {
  type GenerationRunWithArtifacts,
  type GenerationState,
  getGenerationRunResults,
} from '../../../src/db/generation'
import type { Filters } from '../../../src/db/queries'
import type { ApplicationReadiness } from '../../../src/lib/application-readiness'
import { ArtifactActions } from './ArtifactActions'
import { DraftReview } from './DraftReview'
import { query } from './helpers'

function generationCopy(state?: GenerationState) {
  switch (state?.state) {
    case 'current':
      return {
        heading: 'Documents current',
        message: 'Generated documents match the current review.',
        actionLabel: 'Regenerate documents',
      }
    case 'stale':
      return {
        heading: 'Outdated documents',
        message: 'Generated documents are outdated because upstream inputs changed.',
        actionLabel: 'Generate updated documents',
      }
    case 'legacy':
      return {
        heading: 'Legacy documents',
        message: 'These documents predate the current generation workflow.',
        actionLabel: 'Generate updated documents',
      }
    case 'failed':
      return {
        heading: 'Generation failed',
        message: 'The latest attempt failed; a previous result may still be usable.',
        actionLabel: 'Retry generation',
      }
    case 'queued':
      return { heading: 'Queued', message: 'Document generation is queued.', actionLabel: '' }
    case 'processing':
      return { heading: 'Generating', message: 'Document generation is running.', actionLabel: '' }
    default:
      return {
        heading: 'Not generated',
        message: 'Generate tailored documents once the review is ready.',
        actionLabel: 'Generate documents',
      }
  }
}

export function GenerationPanel({
  jobId,
  filters,
  runs,
  googleDriveConnected,
  readiness = { ready: true, reasons: [] },
  state,
}: {
  jobId: number
  filters: Filters
  runs: GenerationRunWithArtifacts[]
  googleDriveConnected: boolean
  readiness?: ApplicationReadiness
  state?: GenerationState
}) {
  const latest = runs[0]
  const usableCompleted = state?.latestCompleted
    ? (runs.find((run) => run.id === state.latestCompleted?.id) ?? null)
    : null
  const copy = generationCopy(state)
  const statusClass =
    latest?.status === 'Completed'
      ? 'badge-success'
      : latest?.status === 'Failed'
        ? 'badge-error'
        : latest?.status === 'Processing'
          ? 'badge-warning'
          : 'badge-info'
  const shouldPoll = latest?.status === 'Queued' || latest?.status === 'Processing'
  const results = usableCompleted ? getGenerationRunResults(usableCompleted.id) : null
  return (
    <section
      id="generation-panel"
      class="rounded-box border border-base-300 p-4"
      {...(shouldPoll
        ? {
            'hx-get': `/applications/${jobId}/generation-runs?${query(filters)}`,
            'hx-trigger': 'every 3s',
            'hx-swap': 'outerHTML',
          }
        : {})}
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 class="font-semibold">{copy.heading}</h3>
          <p class="text-sm text-base-content/60">{copy.message}</p>
          {state?.reasons.length ? (
            <p class="mt-1 text-xs text-base-content/60">Reasons: {state.reasons.join(', ')}</p>
          ) : null}
        </div>
        <form
          hx-post={`/applications/${jobId}/generation-runs?${query(filters)}`}
          hx-target="#generation-panel"
          hx-swap="outerHTML"
          hx-disabled-elt="find button"
        >
          <button class="btn btn-secondary btn-sm" disabled={!readiness.ready || shouldPoll}>
            {shouldPoll ? <span class="loading loading-spinner loading-xs" /> : null}
            {copy.actionLabel}
          </button>
        </form>
      </div>
      {!readiness.ready ? (
        <div class="alert alert-warning mt-4 text-sm" role="alert">
          <ul class="list-inside list-disc space-y-1">
            {readiness.reasons.map((reason) => (
              <li>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {!googleDriveConnected ? (
        <div class="alert mt-4 text-sm">
          <span>Connect Google Drive to upload generated documents automatically.</span>
          <a class="btn btn-outline btn-sm" href="/auth/google/start">
            Connect Google Drive
          </a>
        </div>
      ) : (
        <div class="mt-4 flex items-center justify-between gap-3 rounded-box bg-base-200 p-3 text-sm">
          <span class="flex items-center gap-2">
            <span class="badge badge-success">Connected</span>
            <span>Google Drive is connected.</span>
          </span>
        </div>
      )}
      {latest && latest.id !== usableCompleted?.id ? (
        <div class="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span class="text-base-content/60">Latest attempt:</span>
          <span class={`badge ${statusClass}`}>{latest.status}</span>
          {latest.errorMessage ? <span class="text-error">{latest.errorMessage}</span> : null}
        </div>
      ) : null}
      {usableCompleted ? (
        <div class="mt-4 space-y-3">
          <div class="flex flex-wrap items-center gap-2 text-sm">
            <span class="badge badge-success">Completed</span>
            <span class="text-base-content/60">Attempts: {usableCompleted.attempts}</span>
            {usableCompleted.completedAt ? (
              <span class="text-base-content/60">Date: {usableCompleted.completedAt}</span>
            ) : null}
          </div>
          {usableCompleted.artifacts.length ? (
            <div class="flex flex-wrap gap-2">
              {usableCompleted.artifacts.map((artifact) => (
                <ArtifactActions artifact={artifact} />
              ))}
            </div>
          ) : null}
          <DraftReview
            resumeMarkdown={results?.resumeMarkdown ?? null}
            coverLetterMarkdown={results?.coverLetterMarkdown ?? null}
            draftValidationJson={results?.draftValidationJson ?? null}
          />
        </div>
      ) : latest ? (
        <div class="mt-4 space-y-3">
          <div class="flex flex-wrap items-center gap-2 text-sm">
            <span class={`badge ${statusClass}`}>{latest.status}</span>
            <span class="text-base-content/60">Attempts: {latest.attempts}</span>
          </div>
          {latest.errorMessage ? (
            <div class="alert alert-error text-sm">
              <span>{latest.errorMessage}</span>
            </div>
          ) : null}
        </div>
      ) : (
        <p class="text-sm text-base-content/60">No document generation has been queued yet.</p>
      )}
      {runs.length ? (
        <details class="mt-4 text-sm">
          <summary class="cursor-pointer font-semibold">Generation history ({runs.length})</summary>
          <ul class="mt-2 list-inside space-y-1 text-xs text-base-content/70">
            {runs.map((run) => (
              <li class="flex flex-wrap items-center gap-2">
                <span class="font-mono">#{run.id}</span>
                <span class={`badge badge-sm ${statusClass}`}>{run.status}</span>
                {(run.completedAt ?? run.createdAt) ? (
                  <span>{run.completedAt ?? run.createdAt}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  )
}
