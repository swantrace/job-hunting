import type { CareerDataGap, GapQueueFilters } from '../../../src/db/gap-queue'
import { skillCategoryDefinitions, skillCategoryLabel } from '../../../src/lib/skills/taxonomy'

const decisionOptions = [
  { value: '', label: 'All decisions' },
  { value: 'pending', label: 'Pending' },
  { value: 'include', label: 'Include' },
  { value: 'skip', label: 'Skip' },
] as const

const decisionBadge: Record<string, string> = {
  include: 'badge-primary',
  skip: 'badge-neutral',
  pending: 'badge-ghost',
}

export function CareerDataGapQueue({
  gaps,
  filters,
}: {
  gaps: CareerDataGap[]
  filters: GapQueueFilters
}) {
  const categories = skillCategoryDefinitions()
  return (
    <section id="career-data-gap-queue" class="mt-10">
      <div>
        <h2 class="text-lg font-semibold">Career data gaps</h2>
        <p class="mt-1 text-sm text-base-content/60">
          Requirements the supplied career data cannot verify yet. Update your canonical career-data
          files separately — this list never writes them.
        </p>
      </div>

      <form
        class="card mt-3 border border-base-300 bg-base-100"
        hx-get="/skills/gap-queue"
        hx-target="#career-data-gap-queue"
        hx-swap="outerHTML"
      >
        <div class="card-body gap-3 p-4">
          <div class="grid gap-3 sm:grid-cols-2">
            <select name="category" class="select w-full" aria-label="Filter by category">
              <option value="">All categories</option>
              {categories.map((category) => (
                <option value={category.key} selected={filters.category === category.key}>
                  {category.label}
                </option>
              ))}
            </select>
            <select name="decision" class="select w-full" aria-label="Filter by decision">
              {decisionOptions.map((option) => (
                <option value={option.value} selected={filters.decision === option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div class="flex justify-end">
            <button class="btn btn-sm">Filter</button>
          </div>
        </div>
      </form>

      <div class="mt-4 overflow-hidden rounded-box border border-base-300 bg-base-100">
        {gaps.length ? (
          <table class="table table-sm">
            <caption class="sr-only">Career data gaps</caption>
            <thead>
              <tr>
                <th>Skill</th>
                <th>Category</th>
                <th>Applications</th>
                <th>Latest decision</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {gaps.map((gap) => (
                <tr class="border-base-200 align-top hover:bg-base-200/50">
                  <td class="min-w-48">
                    <p class="font-medium">{gap.skillName}</p>
                    <p class="font-mono text-xs text-base-content/60">{gap.skillKey}</p>
                    {gap.aliases.length ? (
                      <p class="text-xs text-base-content/60">Aliases: {gap.aliases.join(', ')}</p>
                    ) : null}
                    <details class="mt-1 text-xs text-base-content/60">
                      <summary class="cursor-pointer">
                        Requirements ({gap.requirementStatements.length})
                      </summary>
                      <ul class="mt-1 list-inside list-disc space-y-1">
                        {gap.requirementStatements.map((statement) => (
                          <li>{statement}</li>
                        ))}
                      </ul>
                    </details>
                  </td>
                  <td>{gap.category ? (skillCategoryLabel(gap.category) ?? gap.category) : '—'}</td>
                  <td class="min-w-40">
                    <p>{gap.applicationCount}</p>
                    <ul class="mt-1 space-y-1 text-xs text-base-content/60">
                      {gap.sources.map((source) => (
                        <li>
                          <a
                            class="link"
                            href={`/applications/${source.applicationId}/workspace?workspaceTab=review`}
                          >
                            {source.title} — {source.company}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td>
                    <span class={`badge badge-sm ${decisionBadge[gap.latestDecision]}`}>
                      {gap.latestDecision}
                    </span>
                    {gap.latestIncludeReason ? (
                      <p class="mt-1 text-xs text-base-content/60">“{gap.latestIncludeReason}”</p>
                    ) : null}
                  </td>
                  <td>
                    {gap.nowEvidenced ? (
                      <span class="badge badge-success badge-sm">Resolved — now evidenced</span>
                    ) : (
                      <span class="badge badge-neutral badge-sm">Needs career-data evidence</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p class="p-4 text-sm text-base-content/60">
            No career-data gaps. Every requirement is either evidenced or has been decided.
          </p>
        )}
      </div>
    </section>
  )
}
