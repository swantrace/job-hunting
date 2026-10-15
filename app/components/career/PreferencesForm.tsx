import { InputField, TextareaField } from '../ui/FormField'
import { CareerFormAlert } from './CareerFormAlert'
import { ExtensionFieldsEditor } from './ExtensionFieldsEditor'
import { RepeatableTextField } from './RepeatableTextField'
import type { CareerFormFeedback } from './types'

export const preferencesFormRootId = 'career-preferences-form'

/**
 * Preferences editor. It is a singleton form: it always carries its expected
 * revision, so a stale submit becomes a 409 fragment instead of a lost update,
 * and every stored preference (including preserved extension fields) has an
 * ordinary control.
 */
export function PreferencesForm({
  values,
  exists,
  feedback,
}: {
  values: Record<string, string>
  exists: boolean
  feedback?: CareerFormFeedback
}) {
  const errors = feedback?.errors
  return (
    <form
      id={preferencesFormRootId}
      class="card border border-base-300 bg-base-100"
      hx-post="/career-data/preferences/form"
      hx-target={`#${preferencesFormRootId}`}
      hx-swap="outerHTML"
      hx-disabled-elt="find button"
      novalidate
      data-autofocus
      data-career-form="preferences"
    >
      <div class="card-body gap-3 p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-lg font-semibold">Career preferences</h2>
          {exists ? (
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
              hx-get="/career-data/preferences/form"
              hx-target={`#${preferencesFormRootId}`}
              hx-swap="outerHTML"
            >
              Reload the current record
            </button>
          </CareerFormAlert>
        ) : null}
        {feedback?.message ? <CareerFormAlert tone="error" title={feedback.message} /> : null}

        <input type="hidden" name="expectedRevision" value={values.expectedRevision ?? '0'} />

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Where and how you want to work</legend>
          <RepeatableTextField
            id="career-preferences-locations"
            name="locations"
            label="Locations"
            value={values.locations ?? ''}
            error={errors?.locations?.[0]}
            help="One location per line, in preference order."
          />
          <RepeatableTextField
            id="career-preferences-work-modes"
            name="workModes"
            label="Work modes"
            value={values.workModes ?? ''}
            error={errors?.workModes?.[0]}
            help="One mode per line, for example remote, hybrid or on-site."
          />
          <InputField
            name="availability"
            label="Availability"
            value={values.availability}
            error={errors?.availability?.[0]}
            help="For example a notice period or the earliest start date."
          />
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Compensation</legend>
          <InputField
            name="compensationCurrency"
            label="Currency"
            value={values.compensationCurrency}
            error={errors?.compensationCurrency?.[0]}
          />
          <InputField
            name="compensationMinimum"
            type="number"
            label="Minimum"
            value={values.compensationMinimum}
            error={errors?.compensationMinimum?.[0]}
          />
          <InputField
            name="compensationMaximum"
            type="number"
            label="Maximum"
            value={values.compensationMaximum}
            error={errors?.compensationMaximum?.[0]}
          />
          <TextareaField
            name="compensationNotes"
            label="Compensation notes"
            value={values.compensationNotes}
            rows={3}
            error={errors?.compensationNotes?.[0]}
          />
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Notes</legend>
          <TextareaField
            name="notes"
            label="Notes"
            value={values.notes}
            rows={4}
            error={errors?.notes?.[0]}
            help="Editorial notes. Preferences never override a factual constraint."
          />
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Extension fields</legend>
          <ExtensionFieldsEditor
            id="career-preferences-extensions"
            value={values.extensionFields ?? ''}
            error={errors?.extensionFields?.[0]}
          />
        </fieldset>

        <div class="flex justify-end gap-2 pt-2">
          <button
            type="button"
            class="btn btn-ghost"
            hx-get="/career-data/preferences"
            hx-target="#career-data-section"
            hx-swap="outerHTML"
          >
            Cancel
          </button>
          <button class="btn btn-primary" type="submit">
            Save preferences
          </button>
        </div>
      </div>
    </form>
  )
}
