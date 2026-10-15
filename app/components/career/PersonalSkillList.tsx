import type { CareerSkillRecord } from '../../../src/db/career-skills'
import { EmptyState } from '../ui/EmptyState'
import { CheckboxField } from '../ui/FormField'
import { CareerRecordActions } from './CareerRecordActions'
import { retiredQuery } from './helpers'

/**
 * "My skills" list: the personal skills the candidate actually claims. Each row
 * shows the approved catalog identity it points at, the candidate's level and
 * resume eligibility, and the evidence as a narrative. Empty evidence is
 * reported as missing support in your career data — never as incompetence — and
 * an ineligible or unevidenced skill cannot prove a match.
 */
export function PersonalSkillList({
  personalSkills,
  includeRetired,
  oob = false,
}: {
  personalSkills: CareerSkillRecord[]
  includeRetired: boolean
  oob?: boolean
}) {
  const query = retiredQuery(includeRetired)
  return (
    <section
      id="career-skills-list"
      aria-labelledby="career-skills-heading"
      class="space-y-3"
      {...(oob ? { 'hx-swap-oob': 'outerHTML' } : {})}
    >
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="career-skills-heading" class="text-lg font-semibold">
            My skills
          </h2>
          <p class="text-sm text-base-content/60">
            {personalSkills.length} {personalSkills.length === 1 ? 'skill' : 'skills'} claimed.
          </p>
        </div>
        <div class="flex flex-wrap items-end gap-3">
          <form
            hx-get="/career-data/skills"
            hx-target="#career-data-section"
            hx-swap="outerHTML"
            hx-trigger="change"
            hx-push-url="true"
          >
            <CheckboxField
              name="showRetired"
              label="Show retired"
              checked={includeRetired}
              help="Retired skills keep their history and can be restored."
            />
          </form>
          <button
            class="btn btn-primary btn-sm"
            hx-get={`/career-data/skills/form${query}`}
            hx-target="#career-skills-editor"
            hx-swap="innerHTML"
          >
            Add personal skill
          </button>
        </div>
      </div>

      {personalSkills.length > 0 ? (
        <ul class="space-y-3">
          {personalSkills.map((skill) => (
            <li class="card border border-base-300 bg-base-100">
              <div class="card-body gap-2 p-4">
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p class="font-medium">{skill.skillName}</p>
                    <p class="text-xs font-mono text-base-content/60">{skill.skillKey}</p>
                  </div>
                  <div class="flex flex-wrap items-center gap-1">
                    {skill.retiredAt ? (
                      <span class="badge badge-warning badge-sm whitespace-nowrap">Retired</span>
                    ) : null}
                    <span
                      class={`badge badge-sm whitespace-nowrap ${skill.resumeEligible ? 'badge-success' : 'badge-error'}`}
                    >
                      {skill.resumeEligible ? 'Resume eligible' : 'Not eligible for documents'}
                    </span>
                    {skill.category ? (
                      <span class="badge badge-ghost badge-sm whitespace-nowrap">
                        {skill.category}
                      </span>
                    ) : null}
                    {skill.level ? (
                      <span class="badge badge-outline badge-sm whitespace-nowrap">
                        {skill.level}
                      </span>
                    ) : null}
                  </div>
                </div>

                {skill.explanation ? <p class="text-sm">{skill.explanation}</p> : null}
                {skill.notes ? <p class="text-sm text-base-content/70">{skill.notes}</p> : null}

                <div class="text-sm text-base-content/70">
                  <p class="font-medium">Evidence (your own account)</p>
                  {skill.evidence.length > 0 ? (
                    <ul class="list-inside list-disc">
                      {skill.evidence.map((entry) => (
                        <li>{entry}</li>
                      ))}
                    </ul>
                  ) : (
                    <p class="text-base-content/50">
                      No supporting evidence found in your career data yet.
                    </p>
                  )}
                </div>

                <CareerRecordActions
                  section="skills"
                  id={skill.id}
                  retired={skill.retiredAt !== null}
                  includeRetired={includeRetired}
                  includeOrder={false}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="No personal skills claimed yet"
          description="Select an existing approved catalog entry, then record your own level, eligibility and evidence."
        />
      )}
    </section>
  )
}
