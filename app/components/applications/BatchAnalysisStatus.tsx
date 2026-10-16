import { listBatchAnalysisItems } from '../../../src/lib/analysis/batch'

export function BatchAnalysisStatus({ batchId, error }: { batchId?: string; error?: string }) {
  const items = batchId ? listBatchAnalysisItems(batchId) : []
  const active = items.some((item) =>
    ['queued', 'job-analysis', 'candidate-analysis'].includes(item.status),
  )
  const completed = items.filter((item) => item.status === 'completed').length
  const failed = items.filter((item) => item.status === 'failed').length
  const skipped = items.filter((item) => item.status === 'skipped').length
  const labels = {
    queued: 'Queued',
    'job-analysis': 'Analyzing job post',
    'candidate-analysis': 'Analyzing candidate',
    completed: 'Completed',
    failed: 'Failed',
    skipped: 'Skipped',
  }
  return (
    <section
      id="batch-analysis-status"
      class={
        items.length || error
          ? 'mb-4 rounded-box border border-base-300 bg-base-100 p-4'
          : undefined
      }
      aria-live="polite"
      aria-label="Batch analysis progress"
      hx-get={active ? `/applications/batch-analysis?batchId=${batchId}` : undefined}
      hx-trigger={active ? 'every 3s' : undefined}
      hx-swap={active ? 'outerHTML' : undefined}
    >
      {error && (
        <p role="alert" class="alert alert-error">
          {error}
        </p>
      )}
      {!!items.length && (
        <>
          <h2 class="font-semibold">Batch analysis {active ? 'in progress' : 'finished'}</h2>
          <p class="mt-1 text-sm text-base-content/70">
            {completed} completed · {failed} failed · {skipped} skipped ·{' '}
            {items.length - completed - failed - skipped} in progress
          </p>
          <p class="mt-1 text-xs text-base-content/60">
            You can leave this page; queued work continues. Open an application to review its latest
            results.
          </p>
          <div class="mt-3">
            <h3 class="text-sm font-medium">Application results ({items.length})</h3>
            <ul class="mt-2 max-h-80 divide-y divide-base-200 overflow-y-auto">
              {items.map((item) => (
                <li class="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div class="min-w-0 flex-1">
                    <p class="font-medium">{item.label}</p>
                    {item.errorMessage && <p class="text-base-content/70">{item.errorMessage}</p>}
                  </div>
                  <span
                    class={`badge whitespace-nowrap ${item.status === 'failed' ? 'badge-error' : item.status === 'completed' ? 'badge-success' : 'badge-ghost'}`}
                  >
                    {labels[item.status]}
                  </span>
                  {item.jobApplicationId && (
                    <button
                      type="button"
                      class="btn btn-ghost btn-xs"
                      hx-get={`/applications/${item.jobApplicationId}/workspace?workspaceTab=review`}
                      hx-target="#drawer-content"
                      hx-swap="innerHTML"
                      hx-include="#filters"
                      data-open-workspace
                    >
                      Review
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  )
}
