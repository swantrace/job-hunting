import { InputField, TextareaField } from '../ui/FormField'
import { CareerFormAlert } from './CareerFormAlert'
import { DatePrecisionFields } from './DatePrecisionFields'
import { ExtensionFieldsEditor } from './ExtensionFieldsEditor'
import { retiredQuery } from './helpers'
import { RepeatableTextField } from './RepeatableTextField'
import type { CareerFormFeedback } from './types'

/** New records use one root id; an existing record owns its own stable root. */
export function educationFormRootId(recordId: number | null): string {
  return recordId === null ? 'career-education-form' : `career-education-${recordId}-form`
}

export function EducationForm({
  values,
  recordId,
  stableKey,
  includeRetired,
  feedback,
}: {
  values: Record<string, string>
  recordId: number | null
  stableKey?: string
  includeRetired: boolean
  feedback?: CareerFormFeedback
}) {
  const rootId = educationFormRootId(recordId)
  const query = retiredQuery(includeRetired)
  const errors = feedback?.errors
  return (
    <form
      id={rootId}
      class="card border border-base-300 bg-base-100"
      hx-post={
        recordId === null
          ? `/career-data/education/form${query}`
          : `/career-data/education/${recordId}/form${query}`
      }
      hx-target={`#${rootId}`}
      hx-swap="outerHTML"
      hx-disabled-elt="find button"
      novalidate
      data-autofocus
      data-career-form="education"
    >
      <div class="card-body gap-3 p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-lg font-semibold">
            {recordId === null ? 'New education' : 'Edit education'}
          </h2>
          {recordId !== null && values.expectedRevision !== undefined ? (
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
              hx-get={`/career-data/education/${recordId}/form${query}`}
              hx-target={`#${rootId}`}
              hx-swap="outerHTML"
            >
              Reload the current record
            </button>
          </CareerFormAlert>
        ) : null}
        {feedback?.message ? <CareerFormAlert tone="error" title={feedback.message} /> : null}

        <input type="hidden" name="expectedRevision" value={values.expectedRevision ?? '0'} />
        {stableKey ? (
          <p class="text-xs text-base-content/60">
            Stable key <code class="font-mono">{stableKey}</code> — kept when you rename this
            record.
          </p>
        ) : null}

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Award</legend>
          <InputField
            name="degree"
            label="Degree"
            value={values.degree}
            required
            error={errors?.degree?.[0]}
            dataPrimaryInput
          />
          <InputField
            name="school"
            label="School"
            value={values.school}
            required
            error={errors?.school?.[0]}
          />
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Dates</legend>
          <DatePrecisionFields
            idPrefix="career-education"
            startName="startDate"
            endName="endDate"
            precisionName="datePrecision"
            displayName="displayDates"
            values={values}
            errors={errors}
          />
          <InputField
            name="year"
            label="Year"
            type="number"
            value={values.year}
            error={errors?.year?.[0]}
            help="Optional single year, for a certificate or a year-only record."
          />
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Editorial detail</legend>
          <InputField
            name="sortOrder"
            label="Sort order"
            type="number"
            value={values.sortOrder}
            error={errors?.sortOrder?.[0]}
            help="Lower numbers appear first; the list also has move up/down actions."
          />
          <RepeatableTextField
            id="career-education-coursework"
            name="coursework"
            label="Coursework"
            value={values.coursework ?? ''}
            error={errors?.coursework?.[0]}
          />
          <TextareaField
            name="details"
            label="Additional details"
            value={values.details}
            rows={3}
            error={errors?.details?.[0]}
            help="Free text. A preserved structured value is shown as JSON until you replace it."
          />
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Extension fields</legend>
          <ExtensionFieldsEditor
            id="career-education-extensions"
            value={values.extensionFields ?? ''}
            error={errors?.extensionFields?.[0]}
          />
        </fieldset>

        <div class="flex justify-end gap-2 pt-2">
          <button
            type="button"
            class="btn btn-ghost"
            hx-get={`/career-data/education${query}`}
            hx-target="#career-data-section"
            hx-swap="outerHTML"
          >
            Cancel
          </button>
          <button class="btn btn-primary" type="submit">
            Save education
          </button>
        </div>
      </div>
    </form>
  )
}
