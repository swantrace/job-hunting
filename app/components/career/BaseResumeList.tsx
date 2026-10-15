import type { CareerDirectionRecord } from '../../../src/db/career-directions'
import type { CareerBaseResume } from '../../../src/db/schema'
import { EmptyState } from '../ui/EmptyState'
import { CheckboxField } from '../ui/FormField'
import { retiredQuery } from './helpers'

function statusBadgeClass(status: CareerBaseResume['status']): string {
  if (status === 'approved') return 'badge-success'
  if (status === 'superseded') return 'badge-ghost'
  return 'badge-outline'
}

/**
 * Base Resume versions grouped by direction. Versions are immutable; the row
 * actions only preview, copy into a new draft, approve (superseding the previous
 * approval) or supersede. The approved row is marked as the selected version.
 */
export function BaseResumeList({
  directions,
  versions,
  includeRetired,
  oob = false,
}: {
  directions: CareerDirectionRecord[]
  versions: CareerBaseResume[]
  includeRetired: boolean
  oob?: boolean
}) {
  const query = retiredQuery(includeRetired)
  const byDirection = new Map<string, CareerBaseResume[]>()
  for (const version of versions) {
    const list = byDirection.get(version.directionKey) ?? []
    list.push(version)
    byDirection.set(version.directionKey, list)
  }
  const visible = directions.filter((direction) => includeRetired || direction.retiredAt === null)
  return (
    <section
      id="career-base-resumes-list"
      aria-labelledby="career-base-resumes-heading"
      class="space-y-3"
      {...(oob ? { 'hx-swap-oob': 'outerHTML' } : {})}
    >
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="career-base-resumes-heading" class="text-lg font-semibold">
            Base Resume versions
          </h2>
          <p class="text-sm text-base-content/60">
            A version is immutable once created. The approved version stays selected until an
            explicit replacement approval.
          </p>
        </div>
        <div class="flex flex-wrap items-end gap-3">
          <form
            hx-get="/career-data/base-resumes"
            hx-target="#career-data-section"
            hx-swap="outerHTML"
            hx-trigger="change"
            hx-push-url="true"
          >
            <CheckboxField
              name="showRetired"
              label="Show retired"
              checked={includeRetired}
              help="Retired directions keep their version history."
            />
          </form>
          <button
            class="btn btn-primary btn-sm"
            hx-get={`/career-data/base-resumes/form${query}`}
            hx-target="#career-base-resumes-editor"
            hx-swap="innerHTML"
          >
            New draft
          </button>
        </div>
      </div>

      {visible.length > 0 ? (
        <ul class="space-y-3">
          {visible.map((direction) => {
            const list = byDirection.get(direction.key) ?? []
            const selected = list.find((version) => version.status === 'approved') ?? null
            return (
              <li class="card border border-base-300 bg-base-100">
                <div class="card-body gap-2 p-4">
                  <div class="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p class="font-medium">{direction.label}</p>
                      <p class="text-xs text-base-content/60">
                        Stable key <code class="font-mono">{direction.key}</code>
                      </p>
                    </div>
                    {selected ? (
                      <span class="badge badge-success badge-sm whitespace-nowrap">
                        Selected: version {selected.version}
                      </span>
                    ) : (
                      <span class="badge badge-warning badge-sm whitespace-nowrap">
                        No approved version — generation disabled
                      </span>
                    )}
                  </div>

                  {list.length > 0 ? (
                    <ul class="space-y-2">
                      {list.map((version) => (
                        <li class="rounded-box bg-base-200 p-3 text-sm">
                          <div class="flex flex-wrap items-center gap-2">
                            <span class="font-medium">Version {version.version}</span>
                            <span
                              class={`badge badge-sm whitespace-nowrap ${statusBadgeClass(version.status)}`}
                            >
                              {version.status}
                            </span>
                            {version.approvedAt ? (
                              <span class="text-base-content/60">
                                approved {version.approvedAt}
                              </span>
                            ) : null}
                            <code class="text-xs text-base-content/60" title={version.contentHash}>
                              {version.contentHash.slice(0, 12)}…
                            </code>
                          </div>
                          <div class="mt-1 flex flex-wrap items-center gap-1">
                            <button
                              class="btn btn-ghost btn-xs"
                              hx-get={`/career-data/base-resumes/${version.id}/preview${query}`}
                              hx-target="#career-base-resumes-editor"
                              hx-swap="innerHTML"
                            >
                              Preview
                            </button>
                            <button
                              class="btn btn-ghost btn-xs"
                              hx-get={`/career-data/base-resumes/form?direction=${encodeURIComponent(direction.key)}&from=${version.id}`}
                              hx-target="#career-base-resumes-editor"
                              hx-swap="innerHTML"
                            >
                              New draft from this
                            </button>
                            {version.status !== 'approved' ? (
                              <button
                                class="btn btn-primary btn-xs"
                                hx-post={`/career-data/base-resumes/${version.id}/approve${query}`}
                                hx-target="#career-base-resumes-list"
                                hx-swap="outerHTML"
                              >
                                Approve
                              </button>
                            ) : null}
                            {version.status !== 'superseded' ? (
                              <button
                                class="btn btn-ghost btn-xs"
                                hx-post={`/career-data/base-resumes/${version.id}/supersede${query}`}
                                hx-target="#career-base-resumes-list"
                                hx-swap="outerHTML"
                              >
                                Supersede
                              </button>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p class="text-sm text-base-content/50">
                      No versions yet. Create an immutable draft from Markdown.
                    </p>
                  )}

                  <div class="flex justify-end">
                    <button
                      class="btn btn-sm"
                      hx-get={`/career-data/base-resumes/form?direction=${encodeURIComponent(direction.key)}`}
                      hx-target="#career-base-resumes-editor"
                      hx-swap="innerHTML"
                    >
                      New draft
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <EmptyState
          title="No directions recorded yet"
          description="Add a direction first, then create an immutable Base Resume draft from Markdown."
        />
      )}
    </section>
  )
}
