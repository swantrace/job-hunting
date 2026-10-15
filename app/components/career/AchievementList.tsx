import type { CareerCatalogSkill } from '../../../src/db/career-data-view'
import type { CareerDirectionRecord } from '../../../src/db/career-directions'
import type {
  CareerAchievementRecord,
  CareerExperienceRecord,
  CareerPublicationRecord,
} from '../../../src/db/career-records'
import { EmptyState } from '../ui/EmptyState'
import { CheckboxField } from '../ui/FormField'
import { CareerRecordActions } from './CareerRecordActions'
import { retiredQuery } from './helpers'

/**
 * Achievement list. Validated source links (experience, catalog skills,
 * publications, directions) are shown as names resolved from the referenced
 * records; narrative evidence is labelled separately, so the two are never read
 * as the same thing. Retired achievements stay visible in "show retired" mode
 * and can be restored; history is never deleted.
 */
export function AchievementList({
  achievements,
  includeRetired,
  experiences,
  catalogSkills,
  publications,
  directions,
  oob = false,
}: {
  achievements: CareerAchievementRecord[]
  includeRetired: boolean
  experiences: CareerExperienceRecord[]
  catalogSkills: CareerCatalogSkill[]
  publications: CareerPublicationRecord[]
  directions: CareerDirectionRecord[]
  oob?: boolean
}) {
  const query = retiredQuery(includeRetired)
  const experienceById = new Map(experiences.map((row) => [row.id, row]))
  const skillById = new Map(catalogSkills.map((row) => [row.id, row]))
  const publicationById = new Map(publications.map((row) => [row.id, row]))
  const directionLabels = new Map(directions.map((row) => [row.key, row.label]))
  return (
    <section
      id="career-achievements-list"
      aria-labelledby="career-achievements-heading"
      class="space-y-3"
      {...(oob ? { 'hx-swap-oob': 'outerHTML' } : {})}
    >
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="career-achievements-heading" class="text-lg font-semibold">
            Achievements
          </h2>
          <p class="text-sm text-base-content/60">
            {achievements.length} {achievements.length === 1 ? 'record' : 'records'} shown.
          </p>
        </div>
        <div class="flex flex-wrap items-end gap-3">
          <form
            hx-get="/career-data/achievements"
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
            hx-get={`/career-data/achievements/form${query}`}
            hx-target="#career-achievements-editor"
            hx-swap="innerHTML"
          >
            New achievement
          </button>
        </div>
      </div>

      {achievements.length > 0 ? (
        <ul class="space-y-3">
          {achievements.map((achievement) => {
            const experience =
              achievement.experienceId === null
                ? null
                : (experienceById.get(achievement.experienceId) ?? null)
            const skillNames = achievement.skills
              .map((id) => skillById.get(id)?.name ?? `#${id}`)
              .filter(Boolean)
            const publicationTitles = achievement.publicationIds
              .map((id) => publicationById.get(id)?.title ?? `#${id}`)
              .filter(Boolean)
            return (
              <li class="card border border-base-300 bg-base-100">
                <div class="card-body gap-2 p-4">
                  <div class="flex flex-wrap items-start justify-between gap-2">
                    <p class="font-medium">{achievement.claim}</p>
                    <div class="flex flex-wrap items-center gap-1">
                      {achievement.retiredAt ? (
                        <span class="badge badge-warning badge-sm whitespace-nowrap">Retired</span>
                      ) : null}
                      <span
                        class={`badge badge-sm whitespace-nowrap ${achievement.safeToUse ? 'badge-success' : 'badge-error'}`}
                      >
                        {achievement.safeToUse ? 'Safe for documents' : 'Not safe for documents'}
                      </span>
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
                        {achievement.directions.length > 0
                          ? achievement.directions
                              .map((key) => directionLabels.get(key) ?? key)
                              .join(', ')
                          : 'none'}
                      </li>
                      <li>
                        Publications:{' '}
                        {publicationTitles.length > 0 ? publicationTitles.join(', ') : 'none'}
                      </li>
                    </ul>
                  </div>

                  <div class="text-sm text-base-content/70">
                    <p class="font-medium">Narrative attestation (not verified sources)</p>
                    {achievement.evidenceNarratives.length > 0 ? (
                      <ul class="list-inside list-disc">
                        {achievement.evidenceNarratives.map((narrative) => (
                          <li>{narrative}</li>
                        ))}
                      </ul>
                    ) : (
                      <p class="text-base-content/50">No evidence narrative recorded.</p>
                    )}
                    <p>
                      Evidence notes: {achievement.evidence.length}; limitations:{' '}
                      {achievement.limitations.length}
                    </p>
                  </div>

                  {achievement.limitations.length > 0 ? (
                    <ul class="list-inside list-disc text-sm text-base-content/60">
                      {achievement.limitations.map((limitation) => (
                        <li>{limitation}</li>
                      ))}
                    </ul>
                  ) : null}

                  <CareerRecordActions
                    section="achievements"
                    id={achievement.id}
                    retired={achievement.retiredAt !== null}
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
          title="No achievements recorded yet"
          description="Add a claim with its checked sources to give documents verifiable evidence."
        />
      )}
    </section>
  )
}
