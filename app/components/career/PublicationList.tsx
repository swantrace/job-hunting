import type { CareerDirectionRecord } from '../../../src/db/career-directions'
import type {
  CareerExperienceRecord,
  CareerProjectRecord,
  CareerPublicationRecord,
} from '../../../src/db/career-records'
import { EmptyState } from '../ui/EmptyState'
import { CheckboxField } from '../ui/FormField'
import { CareerRecordActions } from './CareerRecordActions'
import { httpUrl, retiredQuery } from './helpers'

/**
 * Publication list. The candidate author is highlighted, unsafe publications are
 * marked so it is obvious they never reach a document, and the private source
 * URLs are labelled as private.
 */
export function PublicationList({
  publications,
  includeRetired,
  experiences,
  projects,
  directions,
  oob = false,
}: {
  publications: CareerPublicationRecord[]
  includeRetired: boolean
  experiences: CareerExperienceRecord[]
  projects: CareerProjectRecord[]
  directions: CareerDirectionRecord[]
  oob?: boolean
}) {
  const query = retiredQuery(includeRetired)
  const experienceById = new Map(experiences.map((row) => [row.id, row]))
  const projectById = new Map(projects.map((row) => [row.id, row]))
  const directionLabels = new Map(directions.map((row) => [row.key, row.label]))
  return (
    <section
      id="career-publications-list"
      aria-labelledby="career-publications-heading"
      class="space-y-3"
      {...(oob ? { 'hx-swap-oob': 'outerHTML' } : {})}
    >
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="career-publications-heading" class="text-lg font-semibold">
            Publications
          </h2>
          <p class="text-sm text-base-content/60">
            {publications.length} {publications.length === 1 ? 'record' : 'records'} shown.
          </p>
        </div>
        <div class="flex flex-wrap items-end gap-3">
          <form
            hx-get="/career-data/publications"
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
            hx-get={`/career-data/publications/form${query}`}
            hx-target="#career-publications-editor"
            hx-swap="innerHTML"
          >
            New publication
          </button>
        </div>
      </div>

      {publications.length > 0 ? (
        <ul class="space-y-3">
          {publications.map((publication) => {
            const experience =
              publication.experienceId === null
                ? null
                : (experienceById.get(publication.experienceId) ?? null)
            const projectNames = publication.projectIds
              .map((id) => projectById.get(id)?.name ?? `#${id}`)
              .filter(Boolean)
            return (
              <li class="card border border-base-300 bg-base-100">
                <div class="card-body gap-2 p-4">
                  <div class="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p class="font-medium">{publication.title}</p>
                      <p class="text-sm text-base-content/70">
                        {publication.citation} ({publication.year})
                      </p>
                    </div>
                    <div class="flex flex-wrap items-center gap-1">
                      {publication.retiredAt ? (
                        <span class="badge badge-warning badge-sm whitespace-nowrap">Retired</span>
                      ) : null}
                      <span class="badge badge-outline badge-sm whitespace-nowrap">
                        {publication.status}
                      </span>
                      <span
                        class={`badge badge-sm whitespace-nowrap ${publication.safeToUse ? 'badge-success' : 'badge-error'}`}
                      >
                        {publication.safeToUse ? 'Safe to use' : 'Not safe for documents'}
                      </span>
                      {publication.authorListTruncated ? (
                        <span class="badge badge-ghost badge-sm whitespace-nowrap">
                          Author list truncated
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div class="text-sm">
                    <p class="font-medium text-base-content/70">Ordered authors</p>
                    <ol class="list-inside list-decimal text-base-content/70">
                      {publication.authors.map((author) => (
                        <li>
                          {author.name}
                          {author.isCandidate ? (
                            <span class="badge badge-primary badge-sm ml-2 whitespace-nowrap">
                              Candidate
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                  </div>

                  <div class="text-sm">
                    <p class="font-medium text-base-content/70">Validated source links</p>
                    <ul class="list-inside list-disc text-base-content/70">
                      <li>
                        Experience:{' '}
                        {experience ? `${experience.role} — ${experience.company}` : 'not linked'}
                      </li>
                      <li>
                        Projects: {projectNames.length > 0 ? projectNames.join(', ') : 'none'}
                      </li>
                      <li>
                        Directions:{' '}
                        {publication.directions.length > 0
                          ? publication.directions
                              .map((key) => directionLabels.get(key) ?? key)
                              .join(', ')
                          : 'none'}
                      </li>
                    </ul>
                  </div>

                  <div class="text-sm text-base-content/70">
                    <p class="font-medium">Narrative attestation (not verified sources)</p>
                    {publication.contributions.length > 0 ? (
                      <ul class="list-inside list-disc">
                        {publication.contributions.map((contribution) => (
                          <li>{contribution}</li>
                        ))}
                      </ul>
                    ) : (
                      <p class="text-base-content/50">No contributions recorded.</p>
                    )}
                  </div>

                  <div class="text-sm">
                    <p class="font-medium text-base-content/70">
                      Private source URLs (excluded from generated context by default)
                    </p>
                    {publication.sourceUrls.length > 0 ? (
                      <ul class="list-inside list-disc">
                        {publication.sourceUrls.map((url) => {
                          const href = httpUrl(url)
                          return (
                            <li>
                              {href ? (
                                <a
                                  class="link break-all"
                                  href={href}
                                  target="_blank"
                                  rel="noreferrer"
                                >
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
                      <p class="text-base-content/50">No source URL recorded.</p>
                    )}
                  </div>

                  <CareerRecordActions
                    section="publications"
                    id={publication.id}
                    retired={publication.retiredAt !== null}
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
          title="No publications recorded yet"
          description="Add a publication with its ordered authors so documents can cite real work."
        />
      )}
    </section>
  )
}
