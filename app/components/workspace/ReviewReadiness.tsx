import type { Filters } from '../../../src/db/queries'
import type { ApplicationReadiness } from '../../../src/lib/application-readiness'
import { query } from './helpers'

export function ReviewReadiness({
  jobId,
  filters,
  readiness,
  oob = false,
}: {
  jobId: number
  filters: Filters
  readiness: ApplicationReadiness
  oob?: boolean
}) {
  return (
    <section
      id="requirement-readiness"
      class="rounded-box border border-base-300 p-4"
      {...(oob ? { 'hx-swap-oob': 'outerHTML' } : {})}
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 class="font-semibold">Document readiness</h3>
          {readiness.ready ? (
            <p class="mt-2 text-sm">
              <span class="badge badge-success">Ready</span> for document generation.
            </p>
          ) : (
            <ul class="mt-2 list-inside list-disc space-y-1 text-sm text-base-content/60">
              {readiness.reasons.map((reason) => (
                <li>{reason}</li>
              ))}
            </ul>
          )}
        </div>
        {readiness.ready ? (
          <button
            class="btn btn-primary btn-sm"
            hx-get={`/applications/${jobId}/workspace?${query(filters)}&workspaceTab=documents`}
            hx-target="#drawer-content"
            hx-swap="innerHTML"
            hx-disabled-elt="this"
          >
            Continue to Documents
          </button>
        ) : null}
      </div>
    </section>
  )
}
