import type { CareerDirectionRecord } from '../../../src/db/career-directions'
import type { CareerProjectRecord } from '../../../src/db/career-records'
import { InputField, TextareaField } from '../ui/FormField'
import { CareerFormAlert } from './CareerFormAlert'
import { ExtensionFieldsEditor } from './ExtensionFieldsEditor'
import { retiredQuery } from './helpers'
import { RelationPicker } from './RelationPicker'
import { RepeatableTextField } from './RepeatableTextField'
import { directionOptions, projectOptions } from './relation-options'
import type { CareerFormFeedback } from './types'

/** New records use one root id; an existing record owns its own stable root. */
export function portfolioFormRootId(recordId: number | null): string {
  return recordId === null ? 'career-portfolio-form' : `career-portfolio-${recordId}-form`
}

/**
 * Portfolio topic editor. The outline and details are editorial content; the
 * project and direction links are validated against the career data, and the
 * sort order is an ordinary number control rather than raw JSON.
 */
export function PortfolioForm({
  values,
  recordId,
  stableKey,
  includeRetired,
  feedback,
  projects,
  directions,
}: {
  values: Record<string, string>
  recordId: number | null
  stableKey?: string
  includeRetired: boolean
  feedback?: CareerFormFeedback
  projects: CareerProjectRecord[]
  directions: CareerDirectionRecord[]
}) {
  const rootId = portfolioFormRootId(recordId)
  const query = retiredQuery(includeRetired)
  const errors = feedback?.errors
  return (
    <form
      id={rootId}
      class="card border border-base-300 bg-base-100"
      hx-post={
        recordId === null
          ? `/career-data/portfolio/form${query}`
          : `/career-data/portfolio/${recordId}/form${query}`
      }
      hx-target={`#${rootId}`}
      hx-swap="outerHTML"
      hx-disabled-elt="find button"
      novalidate
      data-autofocus
      data-career-form="portfolio"
    >
      <div class="card-body gap-3 p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-lg font-semibold">
            {recordId === null ? 'New portfolio topic' : 'Edit portfolio topic'}
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
              hx-get={`/career-data/portfolio/${recordId}/form${query}`}
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
          <legend class="fieldset-legend">Portfolio topic</legend>
          <InputField
            name="title"
            label="Title"
            value={values.title}
            required
            error={errors?.title?.[0]}
            dataPrimaryInput
          />
          <InputField
            name="status"
            label="Status"
            value={values.status}
            error={errors?.status?.[0]}
            help="For example draft, published or archived."
          />
          <InputField
            name="sortOrder"
            type="number"
            label="Sort order"
            value={values.sortOrder}
            error={errors?.sortOrder?.[0]}
            help="Lower numbers appear first in the list."
          />
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Validated source links</legend>
          <p class="label">
            References are checked against your career data. A retired project cannot be linked.
          </p>
          <RelationPicker
            id="career-portfolio-projects"
            name="projectIds"
            label="Projects"
            options={projectOptions(projects)}
            value={values.projectIds ?? ''}
            error={errors?.projectIds?.[0]}
          />
          <RelationPicker
            id="career-portfolio-directions"
            name="directions"
            label="Directions"
            options={directionOptions(directions)}
            value={values.directions ?? ''}
            error={errors?.directions?.[0]}
          />
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Editorial content</legend>
          <RepeatableTextField
            id="career-portfolio-outline"
            name="outline"
            label="Outline"
            value={values.outline ?? ''}
            error={errors?.outline?.[0]}
          />
          <TextareaField
            name="details"
            label="Details"
            value={values.details}
            rows={4}
            error={errors?.details?.[0]}
            help="Free text. A preserved structured value is shown as JSON until you replace it."
          />
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Extension fields</legend>
          <ExtensionFieldsEditor
            id="career-portfolio-extensions"
            value={values.extensionFields ?? ''}
            error={errors?.extensionFields?.[0]}
          />
        </fieldset>

        <div class="flex justify-end gap-2 pt-2">
          <button
            type="button"
            class="btn btn-ghost"
            hx-get={`/career-data/portfolio${query}`}
            hx-target="#career-data-section"
            hx-swap="outerHTML"
          >
            Cancel
          </button>
          <button class="btn btn-primary" type="submit">
            Save topic
          </button>
        </div>
      </div>
    </form>
  )
}
