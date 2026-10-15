import type { CareerCatalogSkill } from '../../../src/db/career-data-view'
import type { CareerDirectionRecord } from '../../../src/db/career-directions'
import type { CareerExperienceRecord, CareerProjectRecord } from '../../../src/db/career-records'
import { EmptyState } from '../ui/EmptyState'
import { CheckboxField } from '../ui/FormField'
import { CareerRecordActions } from './CareerRecordActions'
import { httpUrl, retiredQuery } from './helpers'

/**
 * Project list. Resume-ineligible projects are marked so it is obvious they will
 * never enter a document, and only http(s) URLs are rendered as links. Retired
 * projects stay visible in "show retired" mode and can be restored.
 */
export function ProjectList({
  projects,
  includeRetired,
  experiences,
  catalogSkills,
  directions,
  oob = false,
}: {
  projects: CareerProjectRecord[]
  includeRetired: boolean
  experiences: CareerExperienceRecord[]
  catalogSkills: CareerCatalogSkill[]
  directions: CareerDirectionRecord[]
  oob?: boolean
}) {
  const query = retiredQuery(includeRetired)
  const experienceById = new Map(experiences.map((row) => [row.id, row]))
  const skillById = new Map(catalogSkills.map((row) => [row.id, row]))
  const directionLabels = new Map(directions.map((row) => [row.key, row.label]))
  return (
    <section
      id="career-projects-list"
      aria-labelledby="career-projects-heading"
      class="space-y-3"
      {...(oob ? { 'hx-swap-oob': 'outerHTML' } : {})}
    >
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="career-projects-heading" class="text-lg font-semibold">
            Projects
          </h2>
          <p class="text-sm text-base-content/60">
            {projects.length} {projects.length === 1 ? 'record' : 'records'} shown.
          </p>
        </div>
        <div class="flex flex-wrap items-end gap-3">
          <form
            hx-get="/career-data/projects"
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
            hx-get={`/career-data/projects/form${query}`}
            hx-target="#career-projects-editor"
            hx-swap="innerHTML"
          >
            New project
          </button>
        </div>
      </div>

      {projects.length > 0 ? (
        <ul class="space-y-3">
          {projects.map((project) => {
            const experience =
              project.experienceId === null
                ? null
                : (experienceById.get(project.experienceId) ?? null)
            const skillNames = project.skills
              .map((id) => skillById.get(id)?.name ?? `#${id}`)
              .filter(Boolean)
            return (
              <li class="card border border-base-300 bg-base-100">
                <div class="card-body gap-2 p-4">
                  <div class="flex flex-wrap items-start justify-between gap-2">
                    <p class="font-medium">{project.name}</p>
                    <div class="flex flex-wrap items-center gap-1">
                      {project.retiredAt ? (
                        <span class="badge badge-warning badge-sm whitespace-nowrap">Retired</span>
                      ) : null}
                      <span
                        class={`badge badge-sm whitespace-nowrap ${project.eligibility === 'resume-eligible' ? 'badge-success' : 'badge-error'}`}
                      >
                        {project.eligibility === 'resume-eligible'
                          ? 'Resume eligible'
                          : 'Not eligible for documents'}
                      </span>
                      {project.ownership ? (
                        <span class="badge badge-outline badge-sm whitespace-nowrap">
                          {project.ownership}
                        </span>
                      ) : null}
                      {project.completion ? (
                        <span class="badge badge-ghost badge-sm whitespace-nowrap">
                          {project.completion}
                        </span>
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
                        Catalog skills: {skillNames.length > 0 ? skillNames.join(', ') : 'none'}
                      </li>
                      <li>
                        Directions:{' '}
                        {project.directions.length > 0
                          ? project.directions
                              .map((key) => directionLabels.get(key) ?? key)
                              .join(', ')
                          : 'none'}
                      </li>
                    </ul>
                  </div>

                  {project.urls.length > 0 ? (
                    <ul class="list-inside list-disc text-sm">
                      {project.urls.map((url) => {
                        const href = httpUrl(url)
                        return (
                          <li>
                            {href ? (
                              <a class="link" href={href} target="_blank" rel="noreferrer">
                                {url}
                              </a>
                            ) : (
                              url
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                    <p class="text-sm text-base-content/50">No public URL recorded.</p>
                  )}

                  <div class="text-sm text-base-content/70">
                    <p class="font-medium">Narrative attestation (not verified sources)</p>
                    {project.safeWording ? <p>{project.safeWording}</p> : null}
                    {project.limitations.length > 0 ? (
                      <ul class="list-inside list-disc">
                        {project.limitations.map((limitation) => (
                          <li>{limitation}</li>
                        ))}
                      </ul>
                    ) : (
                      <p class="text-base-content/50">No limitations recorded.</p>
                    )}
                  </div>

                  <CareerRecordActions
                    section="projects"
                    id={project.id}
                    retired={project.retiredAt !== null}
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
          title="No projects recorded yet"
          description="Add a project with its checked sources so documents can cite real work."
        />
      )}
    </section>
  )
}
