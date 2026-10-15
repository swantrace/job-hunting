import type { CareerDirectionRecord } from '../../../src/db/career-directions'
import type { CareerExperienceRecord, CareerProjectRecord } from '../../../src/db/career-records'
import type { PublicationAuthorFormValues } from '../../../src/lib/career/form-input'
import { CheckboxField, InputField, SelectField, TextareaField } from '../ui/FormField'
import { CareerFormAlert } from './CareerFormAlert'
import { ExtensionFieldsEditor } from './ExtensionFieldsEditor'
import { retiredQuery } from './helpers'
import { NarrativeAttestationFields } from './NarrativeAttestationFields'
import { PublicationAuthorsField } from './PublicationAuthorsField'
import { RelationPicker } from './RelationPicker'
import { RepeatableTextField } from './RepeatableTextField'
import { directionOptions, experienceOptions, projectOptions } from './relation-options'
import type { CareerFormFeedback } from './types'

/** New records use one root id; an existing record owns its own stable root. */
export function publicationFormRootId(recordId: number | null): string {
  return recordId === null ? 'career-publications-form' : `career-publications-${recordId}-form`
}

/**
 * Publication editor. Authors are ordered with an explicit candidate toggle and
 * exactly one candidate author is required; the source URLs are private by
 * default, and contributions/limitations are narrative attestation rather than
 * validated sources.
 */
export function PublicationForm({
  values,
  authors,
  recordId,
  stableKey,
  includeRetired,
  feedback,
  experiences,
  projects,
  directions,
}: {
  values: Record<string, string>
  authors: PublicationAuthorFormValues[]
  recordId: number | null
  stableKey?: string
  includeRetired: boolean
  feedback?: CareerFormFeedback
  experiences: CareerExperienceRecord[]
  projects: CareerProjectRecord[]
  directions: CareerDirectionRecord[]
}) {
  const rootId = publicationFormRootId(recordId)
  const query = retiredQuery(includeRetired)
  const errors = feedback?.errors
  return (
    <form
      id={rootId}
      class="card border border-base-300 bg-base-100"
      hx-post={
        recordId === null
          ? `/career-data/publications/form${query}`
          : `/career-data/publications/${recordId}/form${query}`
      }
      hx-target={`#${rootId}`}
      hx-swap="outerHTML"
      hx-disabled-elt="find button"
      novalidate
      data-autofocus
      data-career-form="publications"
    >
      <div class="card-body gap-3 p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-lg font-semibold">
            {recordId === null ? 'New publication' : 'Edit publication'}
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
              hx-get={`/career-data/publications/${recordId}/form${query}`}
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
          <legend class="fieldset-legend">Publication</legend>
          <InputField
            name="title"
            label="Title"
            value={values.title}
            required
            error={errors?.title?.[0]}
            dataPrimaryInput
          />
          <TextareaField
            id="career-publications-citation"
            name="citation"
            label="Citation"
            value={values.citation}
            rows={3}
            required
            error={errors?.citation?.[0]}
          />
          <InputField
            name="year"
            type="number"
            label="Year"
            value={values.year}
            required
            error={errors?.year?.[0]}
          />
          <SelectField
            name="status"
            label="Status"
            error={errors?.status?.[0]}
            help="A publication that is not published yet stays marked as unverified or in review."
          >
            <option value="published" selected={values.status === 'published'}>
              Published
            </option>
            <option value="in-review" selected={values.status === 'in-review'}>
              In review
            </option>
            <option value="preprint" selected={values.status === 'preprint'}>
              Preprint
            </option>
            <option value="needs-verification" selected={values.status === 'needs-verification'}>
              Needs verification
            </option>
          </SelectField>
          <CheckboxField
            name="safeToUse"
            label="Safe to use in documents"
            checked={values.safeToUse === 'on'}
          />
          <CheckboxField
            name="authorListIsTruncated"
            label="Author list is truncated"
            checked={values.authorListIsTruncated === 'on'}
            help="Set when the stored author list does not name every author."
          />
        </fieldset>

        <PublicationAuthorsField authors={authors} error={errors?.authors?.[0]} />

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Validated source links</legend>
          <p class="label">
            References are checked against your career data. A retired record cannot be linked.
          </p>
          <RelationPicker
            id="career-publications-experience"
            name="experienceId"
            label="Experience"
            multiple={false}
            noneLabel="No experience link"
            options={experienceOptions(experiences)}
            value={values.experienceId ?? ''}
            error={errors?.experienceId?.[0]}
          />
          <RelationPicker
            id="career-publications-projects"
            name="projectIds"
            label="Projects"
            options={projectOptions(projects)}
            value={values.projectIds ?? ''}
            error={errors?.projectIds?.[0]}
          />
          <RelationPicker
            id="career-publications-directions"
            name="directions"
            label="Directions"
            options={directionOptions(directions)}
            value={values.directions ?? ''}
            error={errors?.directions?.[0]}
          />
        </fieldset>

        <NarrativeAttestationFields id="career-publications-narrative">
          <RepeatableTextField
            id="career-publications-contributions"
            name="contributions"
            label="Contributions"
            value={values.contributions ?? ''}
            error={errors?.contributions?.[0]}
            help="One contribution per line. Your own account of the work."
          />
        </NarrativeAttestationFields>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Private source URLs</legend>
          <RepeatableTextField
            id="career-publications-source-urls"
            name="sourceUrls"
            label="Source URLs"
            value={values.sourceUrls ?? ''}
            error={errors?.sourceUrls?.[0]}
            help="One http:// or https:// URL per line. These links are private: they are excluded from every generated context (ChatGPT context and drafting data) unless that export explicitly opts in."
            placeholder="https://example.test/publication"
          />
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Extension fields</legend>
          <ExtensionFieldsEditor
            id="career-publications-extensions"
            value={values.extensionFields ?? ''}
            error={errors?.extensionFields?.[0]}
          />
        </fieldset>

        <div class="flex justify-end gap-2 pt-2">
          <button
            type="button"
            class="btn btn-ghost"
            hx-get={`/career-data/publications${query}`}
            hx-target="#career-data-section"
            hx-swap="outerHTML"
          >
            Cancel
          </button>
          <button class="btn btn-primary" type="submit">
            Save publication
          </button>
        </div>
      </div>
    </form>
  )
}
