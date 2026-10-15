import type { CareerDirectionRecord } from '../../../src/db/career-directions'
import type { CareerExperienceRecord, CareerStoryRecord } from '../../../src/db/career-records'
import { EmptyState } from '../ui/EmptyState'
import { CheckboxField } from '../ui/FormField'
import { CareerRecordActions } from './CareerRecordActions'
import { retiredQuery } from './helpers'

/**
 * Story list. The STAR fields and narrative are shown as the candidate's own
 * account, clearly separated from the validated experience/direction links.
 */
export function StoryList({
  stories,
  includeRetired,
  experiences,
  directions,
  oob = false,
}: {
  stories: CareerStoryRecord[]
  includeRetired: boolean
  experiences: CareerExperienceRecord[]
  directions: CareerDirectionRecord[]
  oob?: boolean
}) {
  const query = retiredQuery(includeRetired)
  const experienceById = new Map(experiences.map((row) => [row.id, row]))
  const directionLabels = new Map(directions.map((row) => [row.key, row.label]))
  return (
    <section
      id="career-stories-list"
      aria-labelledby="career-stories-heading"
      class="space-y-3"
      {...(oob ? { 'hx-swap-oob': 'outerHTML' } : {})}
    >
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="career-stories-heading" class="text-lg font-semibold">
            Stories
          </h2>
          <p class="text-sm text-base-content/60">
            {stories.length} {stories.length === 1 ? 'record' : 'records'} shown.
          </p>
        </div>
        <div class="flex flex-wrap items-end gap-3">
          <form
            hx-get="/career-data/stories"
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
            hx-get={`/career-data/stories/form${query}`}
            hx-target="#career-stories-editor"
            hx-swap="innerHTML"
          >
            New story
          </button>
        </div>
      </div>

      {stories.length > 0 ? (
        <ul class="space-y-3">
          {stories.map((story) => {
            const experience =
              story.experienceId === null ? null : (experienceById.get(story.experienceId) ?? null)
            const stars: Array<[string, string | null]> = [
              ['Context', story.context],
              ['Situation', story.situation],
              ['Task', story.task],
              ['Action', story.action],
              ['Result', story.result],
            ]
            return (
              <li class="card border border-base-300 bg-base-100">
                <div class="card-body gap-2 p-4">
                  <div class="flex flex-wrap items-start justify-between gap-2">
                    <p class="font-medium">{story.title}</p>
                    <div class="flex flex-wrap items-center gap-1">
                      {story.retiredAt ? (
                        <span class="badge badge-warning badge-sm whitespace-nowrap">Retired</span>
                      ) : null}
                    </div>
                  </div>

                  <div class="text-sm">
                    <p class="font-medium text-base-content/70">Validated source links</p>
                    <ul class="list-inside list-disc text-base-content/70">
                      <li>
                        Experience:{' '}
                        {experience ? `${experience.role} — ${experience.company}` : 'not linked'}
                      </li>
                      <li>
                        Directions:{' '}
                        {story.directions.length > 0
                          ? story.directions
                              .map((key) => directionLabels.get(key) ?? key)
                              .join(', ')
                          : 'none'}
                      </li>
                    </ul>
                  </div>

                  <div class="text-sm text-base-content/70">
                    <p class="font-medium">STAR narrative (not verified sources)</p>
                    {stars.some(([, text]) => text) ? (
                      <dl class="grid gap-1 sm:grid-cols-2">
                        {stars
                          .filter(([, text]) => text)
                          .map(([label, text]) => (
                            <div>
                              <dt class="text-xs font-semibold uppercase tracking-wider text-base-content/50">
                                {label}
                              </dt>
                              <dd>{text}</dd>
                            </div>
                          ))}
                      </dl>
                    ) : (
                      <p class="text-base-content/50">No STAR detail recorded.</p>
                    )}
                    {story.narrative ? <p class="mt-1">{story.narrative}</p> : null}
                  </div>

                  <CareerRecordActions
                    section="stories"
                    id={story.id}
                    retired={story.retiredAt !== null}
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
          title="No stories recorded yet"
          description="Add a STAR story so documents can draw on a truthful narrative."
        />
      )}
    </section>
  )
}
