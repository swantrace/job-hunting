import type { CareerDirectionRecord } from '../../../src/db/career-directions'
import { EmptyState } from '../ui/EmptyState'
import { CheckboxField } from '../ui/FormField'
import { directionBudgetSummary, retiredQuery } from './helpers'

/**
 * Direction list. Each row shows the stable key, target titles and the effective
 * generation budgets; edit opens the form in the section editor region, and
 * retire/restore returns this list fragment only.
 */
export function DirectionList({
  directions,
  includeRetired,
  oob = false,
}: {
  directions: CareerDirectionRecord[]
  includeRetired: boolean
  oob?: boolean
}) {
  const query = retiredQuery(includeRetired)
  return (
    <section
      id="career-directions-list"
      aria-labelledby="career-directions-heading"
      class="space-y-3"
      {...(oob ? { 'hx-swap-oob': 'outerHTML' } : {})}
    >
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="career-directions-heading" class="text-lg font-semibold">
            Directions
          </h2>
          <p class="text-sm text-base-content/60">
            {directions.length} {directions.length === 1 ? 'direction' : 'directions'} shown. Target
            titles and budgets reach both drafting and validation.
          </p>
        </div>
        <div class="flex flex-wrap items-end gap-3">
          <form
            hx-get="/career-data/directions"
            hx-target="#career-data-section"
            hx-swap="outerHTML"
            hx-trigger="change"
            hx-push-url="true"
          >
            <CheckboxField
              name="showRetired"
              label="Show retired"
              checked={includeRetired}
              help="Retired directions keep their history and can be restored."
            />
          </form>
          <button
            class="btn btn-primary btn-sm"
            hx-get={`/career-data/directions/form${query}`}
            hx-target="#career-directions-editor"
            hx-swap="innerHTML"
          >
            New direction
          </button>
        </div>
      </div>

      {directions.length > 0 ? (
        <ul class="space-y-3">
          {directions.map((direction) => (
            <li class="card border border-base-300 bg-base-100">
              <div class="card-body gap-2 p-4">
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <p class="font-medium">{direction.label}</p>
                  <div class="flex flex-wrap items-center gap-1">
                    {direction.retiredAt ? (
                      <span class="badge badge-warning badge-sm whitespace-nowrap">Retired</span>
                    ) : null}
                    <span class="badge badge-outline badge-sm whitespace-nowrap">
                      <code class="font-mono">{direction.key}</code>
                    </span>
                    <span class="badge badge-ghost badge-sm whitespace-nowrap">
                      Order {direction.sortOrder}
                    </span>
                  </div>
                </div>

                <div class="text-sm">
                  <p class="font-medium text-base-content/70">Target titles</p>
                  {direction.targetTitles.length > 0 ? (
                    <ul class="list-inside list-disc text-base-content/70">
                      {direction.targetTitles.map((title) => (
                        <li>{title}</li>
                      ))}
                    </ul>
                  ) : (
                    <p class="text-base-content/50">No target title recorded.</p>
                  )}
                </div>

                <div class="text-sm text-base-content/70">
                  <p class="font-medium">Generation budgets</p>
                  <p>{directionBudgetSummary(direction.rules)}</p>
                </div>

                <div class="flex flex-wrap items-center gap-1">
                  <button
                    class="btn btn-ghost btn-xs"
                    hx-get={`/career-data/directions/${encodeURIComponent(direction.key)}/form${query}`}
                    hx-target="#career-directions-editor"
                    hx-swap="innerHTML"
                  >
                    Edit
                  </button>
                  <button
                    class="btn btn-ghost btn-xs"
                    hx-post={`/career-data/directions/${encodeURIComponent(direction.key)}/retire${query}`}
                    hx-vals={JSON.stringify({ action: direction.retiredAt ? 'restore' : 'retire' })}
                    hx-target="#career-directions-list"
                    hx-swap="outerHTML"
                  >
                    {direction.retiredAt ? 'Restore' : 'Retire'}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="No directions recorded yet"
          description="Add a direction with its target titles and document budgets."
        />
      )}
    </section>
  )
}
