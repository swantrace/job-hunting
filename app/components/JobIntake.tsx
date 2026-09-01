import type { JobIntakeItem } from '../../src/db/schema'

export type JobIntakeBatchView = {
  id: number
  createdAt: string
  items: JobIntakeItem[]
}

const statusClass: Record<JobIntakeItem['status'], string> = {
  pending: 'badge-info',
  'needs-pasted-text': 'badge-warning',
  ready: 'badge-success',
  failed: 'badge-error',
}

const statusLabel: Record<JobIntakeItem['status'], string> = {
  pending: 'Pending',
  'needs-pasted-text': 'Needs pasted text',
  ready: 'Ready for review',
  failed: 'Failed',
}

function anyPending(batches: JobIntakeBatchView[]) {
  return batches.some((batch) => batch.items.some((item) => item.status === 'pending'))
}

export function JobIntakePanel({
  batches,
  error,
}: {
  batches: JobIntakeBatchView[]
  error?: string
}) {
  const pending = anyPending(batches)
  return (
    <section
      id="job-intake"
      class="space-y-6"
      {...(pending
        ? {
            'hx-get': '/applications/import/status',
            'hx-trigger': 'every 3s',
            'hx-swap': 'outerHTML',
          }
        : {})}
    >
      {error ? (
        <div class="alert alert-error" role="alert">
          <span>{error}</span>
        </div>
      ) : null}
      <form
        class="card border border-base-300 bg-base-100 shadow-sm"
        hx-post="/applications/import"
        hx-target="#job-intake"
        hx-swap="outerHTML"
        hx-disabled-elt="find button"
        novalidate
      >
        <div class="card-body">
          <div>
            <h2 class="card-title">Import job posts</h2>
            <p class="text-sm text-base-content/60">
              Paste one full job description per box (multi-line is fine), or a single{' '}
              <code class="kbd kbd-sm">https</code> URL. Blocked links become “Needs pasted text”
              and are never analyzed.
            </p>
          </div>
          <div id="job-intake-items" class="space-y-3">
            <JobIntakeField />
            <JobIntakeField />
            <JobIntakeField />
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              class="btn btn-outline btn-sm"
              hx-post="/applications/import/add-item"
              hx-target="#job-intake-items"
              hx-swap="beforeend"
            >
              Add another job
            </button>
            <button class="btn btn-primary">
              <span class="loading loading-spinner loading-xs htmx-indicator" /> Import
            </button>
          </div>
        </div>
      </form>
      {batches.length ? <BatchList batches={batches} /> : null}
    </section>
  )
}

export function JobIntakeField() {
  return (
    <textarea
      name="items"
      class="textarea textarea-bordered h-32 w-full"
      placeholder={'Paste one full job description…\nor a single https URL'}
    />
  )
}

function BatchList({ batches }: { batches: JobIntakeBatchView[] }) {
  return (
    <div class="space-y-4">
      <h3 class="font-semibold">Import batches</h3>
      {batches.map((batch) => (
        <section class="card border border-base-300 bg-base-100 shadow-sm">
          <div class="card-body">
            <div class="flex flex-wrap items-center gap-2 text-sm">
              <span class="font-mono">Batch #{batch.id}</span>
              <span class="text-base-content/60">{batch.createdAt}</span>
              <span class="text-base-content/60">
                {batch.items.length} item{batch.items.length === 1 ? '' : 's'}
              </span>
            </div>
            <ul class="mt-2 space-y-2">
              {batch.items.map((item) => (
                <li
                  key={item.id}
                  class="flex flex-wrap items-start gap-2 rounded-box bg-base-200 p-3 text-sm"
                >
                  <span class="font-mono text-xs text-base-content/60">#{item.sequence}</span>
                  <span class={`badge badge-sm ${statusClass[item.status]}`}>
                    {statusLabel[item.status]}
                  </span>
                  <span class="min-w-0 flex-1 break-all text-base-content/70">
                    {item.normalizedUrl ?? item.raw.slice(0, 120)}
                  </span>
                  {item.status === 'ready' && item.jobApplicationId ? (
                    <a
                      class="btn btn-outline btn-xs"
                      href={`/applications/${item.jobApplicationId}`}
                    >
                      Review
                    </a>
                  ) : null}
                  {item.errorMessage ? (
                    <span class="w-full text-xs text-base-content/60">{item.errorMessage}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}
    </div>
  )
}
