import type { CareerDirectionRecord } from '../../../src/db/career-directions'
import { InputField, SelectField, TextareaField } from '../ui/FormField'
import { CareerFormAlert } from './CareerFormAlert'
import type { CareerFormFeedback } from './types'

export const baseResumeDraftFormRootId = 'career-base-resumes-form'

/**
 * Base Resume draft editor. Saving creates a new immutable version from the
 * Markdown; it never overwrites a stored version. A label that already exists
 * for the direction is refused with an inline error naming the immutability.
 */
export function BaseResumeDraftForm({
  values,
  directions,
  feedback,
}: {
  values: Record<string, string>
  directions: CareerDirectionRecord[]
  feedback?: CareerFormFeedback
}) {
  const errors = feedback?.errors
  return (
    <form
      id={baseResumeDraftFormRootId}
      class="card border border-base-300 bg-base-100"
      hx-post="/career-data/base-resumes/form"
      hx-target={`#${baseResumeDraftFormRootId}`}
      hx-swap="outerHTML"
      hx-disabled-elt="find button"
      novalidate
      data-autofocus
      data-career-form="base-resumes"
    >
      <div class="card-body gap-3 p-4">
        <div>
          <h2 class="text-lg font-semibold">New Base Resume draft</h2>
          <p class="text-sm text-base-content/60">
            A draft is immutable once saved. To change wording, create another draft; the stored
            version is never rewritten.
          </p>
        </div>

        {feedback?.message ? <CareerFormAlert tone="error" title={feedback.message} /> : null}
        {directions.length === 0 ? (
          <CareerFormAlert tone="warning" title="Add a direction first">
            <p>A Base Resume version belongs to a direction.</p>
          </CareerFormAlert>
        ) : null}

        {directions.length > 0 ? (
          <>
            <fieldset class="fieldset">
              <legend class="fieldset-legend">Version identity</legend>
              <SelectField
                name="directionKey"
                label="Direction"
                required
                error={errors?.directionKey?.[0]}
                help="Only active directions can receive a new version."
              >
                <option value="">Select a direction</option>
                {directions.map((direction) => (
                  <option value={direction.key} selected={values.directionKey === direction.key}>
                    {direction.label}
                  </option>
                ))}
              </SelectField>
              <InputField
                name="version"
                label="Version label"
                value={values.version}
                required
                error={errors?.version?.[0]}
                help="Unique within the direction, for example v2. An existing label is refused."
                dataPrimaryInput
              />
            </fieldset>

            <fieldset class="fieldset">
              <legend class="fieldset-legend">Markdown</legend>
              <TextareaField
                id="career-base-resumes-markdown"
                name="markdown"
                label="Base Resume Markdown"
                value={values.markdown}
                rows={16}
                required
                error={errors?.markdown?.[0]}
                help="The private editorial starting point for this direction. Markdown is snapshotted with a content hash on save."
              />
            </fieldset>
          </>
        ) : null}

        <div class="flex justify-end gap-2 pt-2">
          <button
            type="button"
            class="btn btn-ghost"
            hx-get="/career-data/base-resumes"
            hx-target="#career-data-section"
            hx-swap="outerHTML"
          >
            Cancel
          </button>
          <button class="btn btn-primary" type="submit" disabled={directions.length === 0}>
            Save draft
          </button>
        </div>
      </div>
    </form>
  )
}
