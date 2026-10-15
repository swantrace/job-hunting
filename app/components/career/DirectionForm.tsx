import { InputField } from '../ui/FormField'
import { CareerFormAlert } from './CareerFormAlert'
import { retiredQuery } from './helpers'
import { RepeatableTextField } from './RepeatableTextField'
import type { CareerFormFeedback } from './types'

/** New records use one root id; an existing record owns its own stable root. */
export function directionFormRootId(key: string | null): string {
  return key === null ? 'career-directions-form' : `career-directions-${key}-form`
}

/**
 * Direction editor. Target titles are repeatable editorial lines and the
 * generation rules are ordinary number controls seeded from the documented
 * default budgets, so no raw JSON is ever required and the stored rules are the
 * effective source for drafting and validation.
 */
export function DirectionForm({
  values,
  directionKey,
  includeRetired,
  feedback,
}: {
  values: Record<string, string>
  directionKey: string | null
  includeRetired: boolean
  feedback?: CareerFormFeedback
}) {
  const rootId = directionFormRootId(directionKey)
  const query = retiredQuery(includeRetired)
  const errors = feedback?.errors
  return (
    <form
      id={rootId}
      class="card border border-base-300 bg-base-100"
      hx-post={
        directionKey === null
          ? `/career-data/directions/form${query}`
          : `/career-data/directions/${encodeURIComponent(directionKey)}/form${query}`
      }
      hx-target={`#${rootId}`}
      hx-swap="outerHTML"
      hx-disabled-elt="find button"
      novalidate
      data-autofocus
      data-career-form="directions"
    >
      <div class="card-body gap-3 p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-lg font-semibold">
            {directionKey === null ? 'New direction' : 'Edit direction'}
          </h2>
          {directionKey !== null && values.expectedRevision !== undefined ? (
            <span class="badge badge-ghost badge-sm whitespace-nowrap">
              Revision {values.expectedRevision}
            </span>
          ) : null}
        </div>

        {feedback?.conflict ? (
          <CareerFormAlert tone="warning" title="This record changed since you opened it">
            <p>Reload the current record before saving, or your changes will overwrite it.</p>
            <button
              type="button"
              class="btn btn-warning btn-xs mt-2"
              hx-get={`/career-data/directions/${encodeURIComponent(directionKey ?? '')}/form${query}`}
              hx-target={`#${rootId}`}
              hx-swap="outerHTML"
            >
              Reload the current record
            </button>
          </CareerFormAlert>
        ) : null}
        {feedback?.message ? <CareerFormAlert tone="error" title={feedback.message} /> : null}

        <input type="hidden" name="expectedRevision" value={values.expectedRevision ?? '0'} />
        {directionKey ? (
          <p class="text-xs text-base-content/60">
            Stable key <code class="font-mono">{directionKey}</code> — kept when you rename this
            direction.
          </p>
        ) : (
          <p class="text-xs text-base-content/60">
            The stable key is generated from the label and kept when you rename the direction.
          </p>
        )}

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Direction</legend>
          <InputField
            name="label"
            label="Label"
            value={values.label}
            required
            error={errors?.label?.[0]}
            dataPrimaryInput
          />
          <RepeatableTextField
            id="career-directions-target-titles"
            name="targetTitles"
            label="Target titles"
            value={values.targetTitles ?? ''}
            error={errors?.targetTitles?.[0]}
            help="One target title per line, in priority order. At least one is required."
          />
          <InputField
            name="sortOrder"
            type="number"
            label="Sort order"
            value={values.sortOrder}
            error={errors?.sortOrder?.[0]}
            help="Lower numbers appear first in lists."
          />
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Generation budgets</legend>
          <p class="label">
            Bounded drafting preferences for this direction. These budgets reach both the drafting
            prompt and deterministic validation; they can never relax a factual constraint.
          </p>
          <InputField
            name="maxWords"
            type="number"
            label="Maximum words"
            value={values.maxWords}
            error={errors?.maxWords?.[0]}
          />
          <InputField
            name="maxBullets"
            type="number"
            label="Maximum bullets"
            value={values.maxBullets}
            error={errors?.maxBullets?.[0]}
          />
          <InputField
            name="summaryMaxWords"
            type="number"
            label="Summary maximum words"
            value={values.summaryMaxWords}
            error={errors?.summaryMaxWords?.[0]}
          />
          <RepeatableTextField
            id="career-directions-section-budgets"
            name="sectionWordBudgets"
            label="Section word budgets"
            value={values.sectionWordBudgets ?? ''}
            error={errors?.sectionWordBudgets?.[0]}
            rows={3}
            help="Optional per-section budgets as section = words, one per line."
          />
        </fieldset>

        <div class="flex justify-end gap-2 pt-2">
          <button
            type="button"
            class="btn btn-ghost"
            hx-get={`/career-data/directions${query}`}
            hx-target="#career-data-section"
            hx-swap="outerHTML"
          >
            Cancel
          </button>
          <button class="btn btn-primary" type="submit">
            Save direction
          </button>
        </div>
      </div>
    </form>
  )
}
