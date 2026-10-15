import type { CareerDirectionRecord } from '../../../src/db/career-directions'
import type {
  CareerPortfolioTopicRecord,
  CareerProjectRecord,
} from '../../../src/db/career-records'
import { EmptyState } from '../ui/EmptyState'
import { CheckboxField } from '../ui/FormField'
import { CareerRecordActions } from './CareerRecordActions'
import { retiredQuery } from './helpers'

/**
 * Portfolio topic list, shown in stored sort order. Project and direction links
 * are resolved to their current names so a stored reference is always readable.
 */
export function PortfolioList({
  topics,
  includeRetired,
  projects,
  directions,
  oob = false,
}: {
  topics: CareerPortfolioTopicRecord[]
  includeRetired: boolean
  projects: CareerProjectRecord[]
  directions: CareerDirectionRecord[]
  oob?: boolean
}) {
  const query = retiredQuery(includeRetired)
  const projectById = new Map(projects.map((row) => [row.id, row]))
  const directionLabels = new Map(directions.map((row) => [row.key, row.label]))
  return (
    <section
      id="career-portfolio-list"
      aria-labelledby="career-portfolio-heading"
      class="space-y-3"
      {...(oob ? { 'hx-swap-oob': 'outerHTML' } : {})}
    >
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="career-portfolio-heading" class="text-lg font-semibold">
            Portfolio topics
          </h2>
          <p class="text-sm text-base-content/60">
            {topics.length} {topics.length === 1 ? 'record' : 'records'} shown.
          </p>
        </div>
        <div class="flex flex-wrap items-end gap-3">
          <form
            hx-get="/career-data/portfolio"
            hx-target="#career-data-section"
            hx-swap="outerHTML"
            hx-trigger="change"
            hx-push-url="true"
          >
            <CheckboxField
              name="showRetired"
              label="Show retired"
              checked={includeRetired}
              help="Retired records keep their history and can be restored."
            />
          </form>
          <button
            class="btn btn-primary btn-sm"
            hx-get={`/career-data/portfolio/form${query}`}
            hx-target="#career-portfolio-editor"
            hx-swap="innerHTML"
          >
            New topic
          </button>
        </div>
      </div>

      {topics.length > 0 ? (
        <ul class="space-y-3">
          {topics.map((topic) => {
            const projectNames = topic.projectIds
              .map((id) => projectById.get(id)?.name ?? `#${id}`)
              .filter(Boolean)
            return (
              <li class="card border border-base-300 bg-base-100">
                <div class="card-body gap-2 p-4">
                  <div class="flex flex-wrap items-start justify-between gap-2">
                    <p class="font-medium">{topic.title}</p>
                    <div class="flex flex-wrap items-center gap-1">
                      {topic.retiredAt ? (
                        <span class="badge badge-warning badge-sm whitespace-nowrap">Retired</span>
                      ) : null}
                      <span class="badge badge-outline badge-sm whitespace-nowrap">
                        {topic.status}
                      </span>
                      <span class="badge badge-ghost badge-sm whitespace-nowrap">
                        Order {topic.sortOrder}
                      </span>
                    </div>
                  </div>

                  <div class="text-sm">
                    <p class="font-medium text-base-content/70">Validated source links</p>
                    <ul class="list-inside list-disc text-base-content/70">
                      <li>
                        Projects: {projectNames.length > 0 ? projectNames.join(', ') : 'none'}
                      </li>
                      <li>
                        Directions:{' '}
                        {topic.directions.length > 0
                          ? topic.directions
                              .map((key) => directionLabels.get(key) ?? key)
                              .join(', ')
                          : 'none'}
                      </li>
                    </ul>
                  </div>

                  <div class="text-sm text-base-content/70">
                    <p class="font-medium">Outline and details</p>
                    {topic.outline.length > 0 ? (
                      <ul class="list-inside list-disc">
                        {topic.outline.map((entry) => (
                          <li>{entry}</li>
                        ))}
                      </ul>
                    ) : (
                      <p class="text-base-content/50">No outline recorded.</p>
                    )}
                    {topic.details === null || topic.details === undefined ? null : (
                      <p class="mt-1 break-words">
                        {typeof topic.details === 'string'
                          ? topic.details
                          : JSON.stringify(topic.details)}
                      </p>
                    )}
                  </div>

                  <CareerRecordActions
                    section="portfolio"
                    id={topic.id}
                    retired={topic.retiredAt !== null}
                    includeRetired={includeRetired}
                    includeOrder={false}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <EmptyState
          title="No portfolio topics recorded yet"
          description="Add a topic with its outline so portfolio work can be organised."
        />
      )}
    </section>
  )
}
