import type { Filters, JobCardData } from '../../../src/db/queries'
import type { RunSkillReview } from '../../../src/db/skill-queries'
import { query } from './helpers'

export function SkillDecisionForm({
  job,
  filters,
  requirement,
  error,
  canDecide = true,
}: {
  job: JobCardData
  filters: Filters
  requirement: RunSkillReview
  error?: string
  canDecide?: boolean
}) {
  const decided = requirement.decision === 'skip' || requirement.decision === 'include'
  const modalId = `include-skill-modal-${requirement.skillId}`
  if (decided && !error) {
    return (
      <div id={`skill-decision-${requirement.skillId}`} class="contents">
        <div class="col-start-2 row-start-1 self-start justify-self-end">
          <span
            class={`badge whitespace-nowrap ${requirement.decision === 'include' ? 'badge-primary' : 'badge-neutral'}`}
          >
            {requirement.decision === 'include' ? 'Included' : 'Skipped'}
          </span>
        </div>
        {requirement.decisionReason ? (
          <p class="col-span-2 row-start-2 text-left text-xs text-base-content/60">
            Reason: “{requirement.decisionReason}”
          </p>
        ) : null}
      </div>
    )
  }
  return (
    <div id={`skill-decision-${requirement.skillId}`} class="contents">
      <div class="col-start-2 row-start-1 flex flex-wrap items-center justify-end gap-2 self-start">
        <form
          hx-post={`/applications/${job.id}/skill-decisions?${query(filters)}`}
          hx-target="#skill-review-panel"
          hx-swap="outerHTML"
          hx-disabled-elt="find button"
          novalidate
        >
          <input type="hidden" name="skillId" value={requirement.skillId} />
          <input type="hidden" name="action" value="skip" />
          <button type="submit" class="btn btn-ghost btn-sm" disabled={!canDecide}>
            Skip
          </button>
        </form>
        <button
          type="button"
          class="btn btn-outline btn-sm"
          popovertarget={modalId}
          disabled={!canDecide}
        >
          Include
        </button>
        <div id={modalId} class="modal" popover="auto" {...(error ? { open: true } : {})}>
          <div class="modal-box">
            <h3 class="text-lg font-bold">Include {requirement.skillName}</h3>
            <p class="mt-1 text-sm text-base-content/60">
              Explain why this skill can be claimed for this application. This reason will be
              available to resume and cover-letter generation.
            </p>
            <form
              class="mt-4"
              hx-post={`/applications/${job.id}/skill-decisions?${query(filters)}`}
              hx-target="#skill-review-panel"
              hx-swap="outerHTML"
              hx-disabled-elt="find button"
              novalidate
            >
              <input type="hidden" name="skillId" value={requirement.skillId} />
              <input type="hidden" name="action" value="include" />
              <fieldset class="fieldset">
                <legend class="fieldset-legend">
                  Reason <span class="text-error">*</span>
                </legend>
                <textarea
                  id={`include-reason-${requirement.skillId}`}
                  name="reason"
                  rows={4}
                  class={`textarea w-full ${error ? 'textarea-error' : ''}`}
                  placeholder="e.g. Used this in a personal prototype with retry handling."
                  required
                  aria-describedby={
                    error ? `include-reason-error-${requirement.skillId}` : undefined
                  }
                  aria-invalid={error ? 'true' : 'false'}
                />
                {error ? (
                  <p
                    id={`include-reason-error-${requirement.skillId}`}
                    role="alert"
                    class="label text-error"
                  >
                    {error}
                  </p>
                ) : null}
              </fieldset>
              <div class="modal-action">
                <button
                  type="button"
                  class="btn"
                  popovertarget={modalId}
                  popovertargetaction="hide"
                >
                  Cancel
                </button>
                <button type="submit" class="btn btn-primary" disabled={!canDecide}>
                  Include
                </button>
              </div>
            </form>
          </div>
          <div class="modal-backdrop">
            <button
              type="button"
              popovertarget={modalId}
              popovertargetaction="hide"
              aria-label="Close Include dialog"
            >
              Close
            </button>
          </div>
        </div>
      </div>
      {!canDecide ? (
        <p class="col-span-2 row-start-2 text-left text-xs text-base-content/60">
          Re-run candidate analysis to update decisions.
        </p>
      ) : null}
    </div>
  )
}
