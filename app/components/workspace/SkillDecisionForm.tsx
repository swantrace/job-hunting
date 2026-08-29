import type { Filters, JobCardData } from '../../../src/db/queries'
import type { ApplicationSkillRequirement } from '../../../src/db/skill-queries'
import { query } from './helpers'

export function SkillDecisionForm({
  job,
  filters,
  requirement,
  error,
}: {
  job: JobCardData
  filters: Filters
  requirement: ApplicationSkillRequirement
  error?: string
}) {
  const decided = requirement.userDecision === 'skip' || requirement.userDecision === 'include'
  if (decided && !error) {
    return (
      <div id={`skill-decision-${requirement.skillId}`} class="text-right">
        <span
          class={`badge ${requirement.userDecision === 'include' ? 'badge-primary' : 'badge-neutral'}`}
        >
          {requirement.userDecision === 'include' ? 'Included' : 'Skipped'}
        </span>
        {requirement.decisionReason ? (
          <p class="mt-1 max-w-xs text-xs text-base-content/60">“{requirement.decisionReason}”</p>
        ) : null}
      </div>
    )
  }
  return (
    <form
      id={`skill-decision-${requirement.skillId}`}
      hx-post={`/applications/${job.id}/skill-decisions?${query(filters)}`}
      hx-target="#skill-review-panel"
      hx-swap="outerHTML"
      hx-disabled-elt="find button"
      novalidate
    >
      <input type="hidden" name="skillId" value={requirement.skillId} />
      <div class="flex flex-wrap items-center justify-end gap-2">
        <button name="action" value="skip" class="btn btn-ghost btn-sm">
          Skip
        </button>
        <details class="dropdown dropdown-end">
          <summary class="btn btn-outline btn-sm">Include for this application</summary>
          <div class="dropdown-content z-30 mt-2 w-80 rounded-box border border-base-300 bg-base-100 p-3 shadow-lg">
            <label class="label" for={`include-reason-${requirement.skillId}`}>
              <span>
                Why can this skill be used? <span class="text-error">*</span>
              </span>
            </label>
            <textarea
              id={`include-reason-${requirement.skillId}`}
              name="reason"
              rows={3}
              class="textarea textarea-sm w-full"
              placeholder="e.g. Used this in a personal prototype with retry handling."
            />
            <button name="action" value="include" class="btn btn-primary btn-sm mt-2 w-full">
              Include
            </button>
          </div>
        </details>
      </div>
      {error ? (
        <p role="alert" class="mt-2 text-sm text-error">
          {error}
        </p>
      ) : null}
    </form>
  )
}
