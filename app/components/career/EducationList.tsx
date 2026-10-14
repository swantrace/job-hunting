import type { CareerEducationRecord } from '../../../src/db/career-records'
import { EmptyState } from '../ui/EmptyState'
import { CheckboxField } from '../ui/FormField'
import { CareerRecordActions } from './CareerRecordActions'
import { dateRange, retiredQuery } from './helpers'

/**
 * Education list, with the same retired-record policy as experience: retired rows
 * are only visible in "show retired" mode and remain restorable.
 */
export function EducationList({
  education,
  includeRetired,
  oob = false,
}: {
  education: CareerEducationRecord[]
  includeRetired: boolean
  oob?: boolean
}) {
  const query = retiredQuery(includeRetired)
  return (
    <section
      id="career-education-list"
      aria-labelledby="career-education-heading"
      class="space-y-3"
      {...(oob ? { 'hx-swap-oob': 'outerHTML' } : {})}
    >
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="career-education-heading" class="text-lg font-semibold">
            Education
          </h2>
          <p class="text-sm text-base-content/60">
            {education.length} {education.length === 1 ? 'record' : 'records'} shown.
          </p>
        </div>
        <div class="flex flex-wrap items-end gap-3">
          <form
            hx-get="/career-data/education"
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
            hx-get={`/career-data/education/form${query}`}
            hx-target="#career-education-editor"
            hx-swap="innerHTML"
          >
            New education
          </button>
        </div>
      </div>

      {education.length > 0 ? (
        <ul class="space-y-3">
          {education.map((record) => (
            <li class="card border border-base-300 bg-base-100">
              <div class="card-body gap-2 p-4">
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p class="font-medium">{record.degree}</p>
                    <p class="text-sm text-base-content/60">{record.school}</p>
                  </div>
                  <div class="flex flex-wrap items-center gap-1">
                    {record.retiredAt ? (
                      <span class="badge badge-warning badge-sm whitespace-nowrap">Retired</span>
                    ) : null}
                    {record.year !== null ? (
                      <span class="badge badge-outline badge-sm whitespace-nowrap">
                        {record.year}
                      </span>
                    ) : null}
                    <span class="badge badge-ghost badge-sm whitespace-nowrap">
                      {dateRange(record)}
                    </span>
                    <span class="badge badge-ghost badge-sm whitespace-nowrap">
                      {record.datePrecision} precision
                    </span>
                  </div>
                </div>
                {record.coursework.length > 0 ? (
                  <ul class="list-inside list-disc text-sm text-base-content/70">
                    {record.coursework.map((course) => (
                      <li>{course}</li>
                    ))}
                  </ul>
                ) : (
                  <p class="text-sm text-base-content/50">No coursework recorded.</p>
                )}
                <CareerRecordActions
                  section="education"
                  id={record.id}
                  retired={record.retiredAt !== null}
                  includeRetired={includeRetired}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="No education recorded yet"
          description="Add a degree or certificate so documents can cite it."
        />
      )}
    </section>
  )
}
