import { InputField, TextareaField } from '../ui/FormField'
import { CareerFormAlert } from './CareerFormAlert'
import { DatePrecisionFields } from './DatePrecisionFields'
import { ExtensionFieldsEditor } from './ExtensionFieldsEditor'
import { retiredQuery } from './helpers'
import { RepeatableTextField } from './RepeatableTextField'
import type { CareerFormFeedback } from './types'

/** New records use one root id; an existing record owns its own stable root. */
export function experienceFormRootId(recordId: number | null): string {
  return recordId === null ? 'career-experience-form' : `career-experience-${recordId}-form`
}

export function ExperienceForm({
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
  const rootId = experienceFormRootId(recordId)
  const query = retiredQuery(includeRetired)
  const errors = feedback?.errors
  return (
    <form
      id={rootId}
      class="card border border-base-300 bg-base-100"
      hx-post={
        recordId === null
          ? `/career-data/experience/form${query}`
          : `/career-data/experience/${recordId}/form${query}`
      }
      hx-target={`#${rootId}`}
      hx-swap="outerHTML"
      hx-disabled-elt="find button"
      novalidate
      data-autofocus
      data-career-form="experience"
    >
      <div class="card-body gap-3 p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-lg font-semibold">
            {recordId === null ? 'New experience' : 'Edit experience'}
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
              hx-get={`/career-data/experience/${recordId}/form${query}`}
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
          <legend class="fieldset-legend">Role</legend>
          <InputField
            name="company"
            label="Company"
            value={values.company}
            required
            error={errors?.company?.[0]}
            dataPrimaryInput
          />
          <InputField
            name="role"
            label="Role"
            value={values.role}
            required
            error={errors?.role?.[0]}
          />
          <InputField
            name="employmentNature"
            label="Employment nature"
            value={values.employmentNature}
            list="career-employment-nature-options"
            error={errors?.employmentNature?.[0]}
            help="Free text; for example full-time, contract or part-time."
          />
          <datalist id="career-employment-nature-options">
            <option value="full-time" />
            <option value="part-time" />
            <option value="contract" />
            <option value="internship" />
            <option value="volunteer" />
          </datalist>
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Dates</legend>
          <DatePrecisionFields
            idPrefix="career-experience"
            startName="startDate"
            endName="endDate"
            precisionName="datePrecision"
            displayName="displayDates"
            values={values}
            errors={errors}
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
          <TextareaField
            name="context"
            label="Context"
            value={values.context}
            rows={3}
            error={errors?.context?.[0]}
          />
          <RepeatableTextField
            id="career-experience-responsibilities"
            name="responsibilities"
            label="Responsibilities"
            value={values.responsibilities ?? ''}
            error={errors?.responsibilities?.[0]}
          />
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Extension fields</legend>
          <ExtensionFieldsEditor
            id="career-experience-extensions"
            value={values.extensionFields ?? ''}
            error={errors?.extensionFields?.[0]}
          />
        </fieldset>

        <div class="flex justify-end gap-2 pt-2">
          <button
            type="button"
            class="btn btn-ghost"
            hx-get={`/career-data/experience${query}`}
            hx-target="#career-data-section"
            hx-swap="outerHTML"
          >
            Cancel
          </button>
          <button class="btn btn-primary" type="submit">
            Save experience
          </button>
        </div>
      </div>
    </form>
  )
}
