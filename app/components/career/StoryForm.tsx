import type { CareerDirectionRecord } from '../../../src/db/career-directions'
import type { CareerExperienceRecord } from '../../../src/db/career-records'
import { InputField, TextareaField } from '../ui/FormField'
import { CareerFormAlert } from './CareerFormAlert'
import { ExtensionFieldsEditor } from './ExtensionFieldsEditor'
import { retiredQuery } from './helpers'
import { NarrativeAttestationFields } from './NarrativeAttestationFields'
import { RelationPicker } from './RelationPicker'
import { directionOptions, experienceOptions } from './relation-options'
import type { CareerFormFeedback } from './types'

/** New records use one root id; an existing record owns its own stable root. */
export function storyFormRootId(recordId: number | null): string {
  return recordId === null ? 'career-stories-form' : `career-stories-${recordId}-form`
}

/**
 * Story editor. The STAR fields and free narrative are candidate-authored text,
 * kept separate from the validated experience/direction links above them, so a
 * story is never mistaken for an independently verified source.
 */
export function StoryForm({
  values,
  recordId,
  stableKey,
  includeRetired,
  feedback,
  experiences,
  directions,
}: {
  values: Record<string, string>
  recordId: number | null
  stableKey?: string
  includeRetired: boolean
  feedback?: CareerFormFeedback
  experiences: CareerExperienceRecord[]
  directions: CareerDirectionRecord[]
}) {
  const rootId = storyFormRootId(recordId)
  const query = retiredQuery(includeRetired)
  const errors = feedback?.errors
  return (
    <form
      id={rootId}
      class="card border border-base-300 bg-base-100"
      hx-post={
        recordId === null
          ? `/career-data/stories/form${query}`
          : `/career-data/stories/${recordId}/form${query}`
      }
      hx-target={`#${rootId}`}
      hx-swap="outerHTML"
      hx-disabled-elt="find button"
      novalidate
      data-autofocus
      data-career-form="stories"
    >
      <div class="card-body gap-3 p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-lg font-semibold">{recordId === null ? 'New story' : 'Edit story'}</h2>
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
              hx-get={`/career-data/stories/${recordId}/form${query}`}
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
          <legend class="fieldset-legend">Story</legend>
          <InputField
            name="title"
            label="Title"
            value={values.title}
            required
            error={errors?.title?.[0]}
            dataPrimaryInput
          />
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Validated source links</legend>
          <p class="label">
            References are checked against your career data. A retired experience cannot be linked.
          </p>
          <RelationPicker
            id="career-stories-experience"
            name="experienceId"
            label="Experience"
            multiple={false}
            noneLabel="No experience link"
            options={experienceOptions(experiences)}
            value={values.experienceId ?? ''}
            error={errors?.experienceId?.[0]}
          />
          <RelationPicker
            id="career-stories-directions"
            name="directions"
            label="Directions"
            options={directionOptions(directions)}
            value={values.directions ?? ''}
            error={errors?.directions?.[0]}
          />
        </fieldset>

        <NarrativeAttestationFields id="career-stories-narrative">
          <TextareaField
            id="career-stories-context"
            name="context"
            label="Context"
            value={values.context}
            rows={3}
            error={errors?.context?.[0]}
          />
          <TextareaField
            id="career-stories-situation"
            name="situation"
            label="Situation"
            value={values.situation}
            rows={3}
            error={errors?.situation?.[0]}
          />
          <TextareaField
            id="career-stories-task"
            name="task"
            label="Task"
            value={values.task}
            rows={3}
            error={errors?.task?.[0]}
          />
          <TextareaField
            id="career-stories-action"
            name="action"
            label="Action"
            value={values.action}
            rows={3}
            error={errors?.action?.[0]}
          />
          <TextareaField
            id="career-stories-result"
            name="result"
            label="Result"
            value={values.result}
            rows={3}
            error={errors?.result?.[0]}
          />
          <TextareaField
            id="career-stories-narrative-text"
            name="narrative"
            label="Narrative"
            value={values.narrative}
            rows={5}
            error={errors?.narrative?.[0]}
            help="The full story in your own words. Narrative text, not a verified source."
          />
        </NarrativeAttestationFields>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Extension fields</legend>
          <ExtensionFieldsEditor
            id="career-stories-extensions"
            value={values.extensionFields ?? ''}
            error={errors?.extensionFields?.[0]}
          />
        </fieldset>

        <div class="flex justify-end gap-2 pt-2">
          <button
            type="button"
            class="btn btn-ghost"
            hx-get={`/career-data/stories${query}`}
            hx-target="#career-data-section"
            hx-swap="outerHTML"
          >
            Cancel
          </button>
          <button class="btn btn-primary" type="submit">
            Save story
          </button>
        </div>
      </div>
    </form>
  )
}
