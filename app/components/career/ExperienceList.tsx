import type { CareerExperienceRecord } from '../../../src/db/career-records'
import { EmptyState } from '../ui/EmptyState'
import { CheckboxField } from '../ui/FormField'
import { CareerRecordActions } from './CareerRecordActions'
import { dateRange, retiredQuery } from './helpers'

/**
 * Experience list. The retired-record filter is a plain form with an HTMX change
 * trigger, so no script and no raw JSON is involved. Retired rows stay visible in
 * "show retired" mode with a restore action; history is never deleted.
 */
export function ExperienceList({
  experiences,
  includeRetired,
  oob = false,
}: {
  experiences: CareerExperienceRecord[]
  includeRetired: boolean
  oob?: boolean
}) {
  const query = retiredQuery(includeRetired)
  return (
    <section
      id="career-experience-list"
      aria-labelledby="career-experience-heading"
      class="space-y-3"
      {...(oob ? { 'hx-swap-oob': 'outerHTML' } : {})}
    >
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="career-experience-heading" class="text-lg font-semibold">
            Experience
          </h2>
          <p class="text-sm text-base-content/60">
            {experiences.length} {experiences.length === 1 ? 'record' : 'records'} shown.
          </p>
        </div>
        <div class="flex flex-wrap items-end gap-3">
          <form
            hx-get="/career-data/experience"
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
            hx-get={`/career-data/experience/form${query}`}
            hx-target="#career-experience-editor"
            hx-swap="innerHTML"
          >
            New experience
          </button>
        </div>
      </div>

      {experiences.length > 0 ? (
        <ul class="space-y-3">
          {experiences.map((experience) => (
            <li class="card border border-base-300 bg-base-100">
              <div class="card-body gap-2 p-4">
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p class="font-medium">{experience.role}</p>
                    <p class="text-sm text-base-content/60">{experience.company}</p>
                  </div>
                  <div class="flex flex-wrap items-center gap-1">
                    {experience.retiredAt ? (
                      <span class="badge badge-warning badge-sm whitespace-nowrap">Retired</span>
                    ) : null}
                    {experience.employmentNature ? (
                      <span class="badge badge-outline badge-sm whitespace-nowrap">
                        {experience.employmentNature}
                      </span>
                    ) : null}
                    <span class="badge badge-ghost badge-sm whitespace-nowrap">
                      {dateRange(experience)}
                    </span>
                    <span class="badge badge-ghost badge-sm whitespace-nowrap">
                      {experience.datePrecision} precision
                    </span>
                  </div>
                </div>
                {experience.context ? <p class="text-sm">{experience.context}</p> : null}
                {experience.responsibilities.length > 0 ? (
                  <ul class="list-inside list-disc text-sm text-base-content/70">
                    {experience.responsibilities.map((responsibility) => (
                      <li>{responsibility}</li>
                    ))}
                  </ul>
                ) : (
                  <p class="text-sm text-base-content/50">No responsibilities recorded.</p>
                )}
                <CareerRecordActions
                  section="experience"
                  id={experience.id}
                  retired={experience.retiredAt !== null}
                  includeRetired={includeRetired}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="No experience recorded yet"
          description="Add a role to build the employment history documents can cite."
        />
      )}
    </section>
  )
}
