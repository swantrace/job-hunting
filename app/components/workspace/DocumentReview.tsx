import { documentReviewSchema } from '../../../src/ai/schemas/document-review'
import type { DocumentReview as DocumentReviewRecord } from '../../../src/db/document-review'
import type { Filters } from '../../../src/db/queries'
import { query } from './helpers'

function parseFindings(review: DocumentReviewRecord | null) {
  if (!review?.resultJson) return null
  try {
    return documentReviewSchema.parse(JSON.parse(review.resultJson))
  } catch {
    return null
  }
}

const severityClass = {
  blocking: 'badge-error',
  important: 'badge-warning',
  optional: 'badge-info',
} as const

const verdictClass = {
  approve: 'badge-success',
  revise: 'badge-warning',
} as const

export function DocumentReviewPanel({
  jobId,
  runId,
  filters,
  review,
  canReview,
}: {
  jobId: number
  runId: number
  filters: Filters
  review: DocumentReviewRecord | null
  canReview: boolean
}) {
  const result = parseFindings(review)
  const shouldPoll = review?.status === 'Queued' || review?.status === 'Processing'
  const statusClass =
    review?.status === 'Completed'
      ? 'badge-success'
      : review?.status === 'Failed'
        ? 'badge-error'
        : review?.status === 'Processing'
          ? 'badge-warning'
          : 'badge-info'
  return (
    <section
      id="document-review"
      class="rounded-box border border-base-300 p-4"
      aria-live="polite"
      {...(shouldPoll
        ? {
            'hx-get': `/applications/${jobId}/generation-runs/${runId}/reviews?${query(filters)}`,
            'hx-trigger': 'every 3s',
            'hx-swap': 'outerHTML',
          }
        : {})}
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 class="font-semibold">Semantic document review</h3>
          <p class="text-sm text-base-content/60">
            Optional paid review. The model observes only; it never rewrites your documents.
          </p>
        </div>
        <form
          hx-post={`/applications/${jobId}/generation-runs/${runId}/reviews?${query(filters)}`}
          hx-target="#document-review"
          hx-swap="outerHTML"
          hx-disabled-elt="find button"
        >
          <button class="btn btn-outline btn-sm" disabled={!canReview}>
            <span class="loading loading-spinner loading-xs htmx-indicator" />
            Review generated documents
          </button>
        </form>
      </div>
      {review ? (
        <div class="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span class={`badge ${statusClass}`}>{review.status}</span>
          {shouldPoll ? (
            <span class="loading loading-spinner loading-xs" aria-hidden="true" />
          ) : null}
        </div>
      ) : (
        <p class="mt-3 text-sm text-base-content/60">No review has been requested yet.</p>
      )}
      {review?.errorMessage ? (
        <div class="alert alert-error mt-3 text-sm">
          <span>{review.errorMessage}</span>
        </div>
      ) : null}
      {result ? (
        <div class="mt-3 space-y-3">
          <div class="flex flex-wrap items-start gap-2">
            <span class={`badge capitalize ${verdictClass[result.verdict]}`}>{result.verdict}</span>
            <p class="min-w-0 flex-1 text-sm text-base-content/70">{result.summary}</p>
          </div>
          <ul class="space-y-2">
            {result.findings.map((finding) => (
              <li class="rounded-box border border-base-300 p-3 text-sm">
                <div class="flex flex-wrap items-center gap-2">
                  <span class={`badge ${severityClass[finding.severity]}`}>{finding.severity}</span>
                  <span class="badge badge-outline">{finding.document}</span>
                  <span class="badge badge-ghost">{finding.category}</span>
                  <span class="font-mono text-xs text-base-content/60">{finding.section}</span>
                </div>
                <p class="mt-1 italic text-base-content/70">“{finding.claim}”</p>
                <p class="mt-1">{finding.message}</p>
                <p class="mt-2 text-base-content/80">
                  <span class="font-semibold">Recommended action:</span> {finding.recommendedAction}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
