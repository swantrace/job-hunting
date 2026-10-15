import type { CareerCatalogSkill } from '../../../src/db/career-data-view'
import type { CareerDirectionRecord } from '../../../src/db/career-directions'
import type { CareerExperienceRecord } from '../../../src/db/career-records'
import { InputField, SelectField, TextareaField } from '../ui/FormField'
import { CareerFormAlert } from './CareerFormAlert'
import { retiredQuery } from './helpers'
import { NarrativeAttestationFields } from './NarrativeAttestationFields'
import { RelationPicker } from './RelationPicker'
import { RepeatableTextField } from './RepeatableTextField'
import { catalogSkillOptions, directionOptions, experienceOptions } from './relation-options'
import type { CareerFormFeedback } from './types'

/** New records use one root id; an existing record owns its own stable root. */
export function projectFormRootId(recordId: number | null): string {
  return recordId === null ? 'career-projects-form' : `career-projects-${recordId}-form`
}

/**
 * Project editor. Ownership, eligibility, completion and the public URLs are the
 * checked record detail; safe wording and limitations are narrative attestation
 * and are labelled as such. Only http(s) URLs are accepted, so a project can
 * never publish a script or local address as a source.
 */
export function ProjectForm({
  values,
  recordId,
  stableKey,
  includeRetired,
  feedback,
  experiences,
  directions,
  catalogSkills,
}: {
  values: Record<string, string>
  recordId: number | null
  stableKey?: string
  includeRetired: boolean
  feedback?: CareerFormFeedback
  experiences: CareerExperienceRecord[]
  directions: CareerDirectionRecord[]
  catalogSkills: CareerCatalogSkill[]
}) {
  const rootId = projectFormRootId(recordId)
  const query = retiredQuery(includeRetired)
  const errors = feedback?.errors
  return (
    <form
      id={rootId}
      class="card border border-base-300 bg-base-100"
      hx-post={
        recordId === null
          ? `/career-data/projects/form${query}`
          : `/career-data/projects/${recordId}/form${query}`
      }
      hx-target={`#${rootId}`}
      hx-swap="outerHTML"
      hx-disabled-elt="find button"
      novalidate
      data-autofocus
      data-career-form="projects"
    >
      <div class="card-body gap-3 p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-lg font-semibold">
            {recordId === null ? 'New project' : 'Edit project'}
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
              hx-get={`/career-data/projects/${recordId}/form${query}`}
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
          <legend class="fieldset-legend">Project</legend>
          <InputField
            name="name"
            label="Name"
            value={values.name}
            required
            error={errors?.name?.[0]}
            dataPrimaryInput
          />
          <InputField
            name="ownership"
            label="Ownership"
            value={values.ownership}
            error={errors?.ownership?.[0]}
            help="For example personal, team or client work."
          />
          <SelectField
            name="eligibility"
            label="Resume eligibility"
            error={errors?.eligibility?.[0]}
            help="A not-eligible project stays in your career data but never enters a document."
          >
            <option value="resume-eligible" selected={values.eligibility !== 'not-eligible'}>
              Resume eligible
            </option>
            <option value="not-eligible" selected={values.eligibility === 'not-eligible'}>
              Not eligible — keep out of documents
            </option>
          </SelectField>
          <InputField
            name="completion"
            label="Completion"
            value={values.completion}
            error={errors?.completion?.[0]}
            help="For example completed, ongoing or archived."
          />
          <RepeatableTextField
            id="career-projects-urls"
            name="urls"
            label="Public URLs"
            value={values.urls ?? ''}
            error={errors?.urls?.[0]}
            help="One http:// or https:// URL per line. Order is preserved."
            placeholder="https://example.test/project"
          />
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Validated source links</legend>
          <p class="label">
            References are checked against your career data. A retired experience cannot be linked.
          </p>
          <RelationPicker
            id="career-projects-experience"
            name="experienceId"
            label="Experience"
            multiple={false}
            noneLabel="No experience link"
            options={experienceOptions(experiences)}
            value={values.experienceId ?? ''}
            error={errors?.experienceId?.[0]}
          />
          <RelationPicker
            id="career-projects-skills"
            name="skills"
            label="Catalog skills"
            options={catalogSkillOptions(catalogSkills)}
            value={values.skills ?? ''}
            error={errors?.skills?.[0]}
            help="Only approved catalog skills can back a project."
          />
          <RelationPicker
            id="career-projects-directions"
            name="directions"
            label="Directions"
            options={directionOptions(directions)}
            value={values.directions ?? ''}
            error={errors?.directions?.[0]}
          />
        </fieldset>

        <NarrativeAttestationFields id="career-projects-narrative">
          <TextareaField
            id="career-projects-safe-wording"
            name="safeWording"
            label="Safe wording"
            value={values.safeWording}
            rows={3}
            error={errors?.safeWording?.[0]}
            help="Approved phrasing for this project. Narrative text, not a verified source."
          />
          <RepeatableTextField
            id="career-projects-limitations"
            name="limitations"
            label="Limitations"
            value={values.limitations ?? ''}
            error={errors?.limitations?.[0]}
            help="One limitation per line. State what the project does not cover."
          />
        </NarrativeAttestationFields>

        <div class="flex justify-end gap-2 pt-2">
          <button
            type="button"
            class="btn btn-ghost"
            hx-get={`/career-data/projects${query}`}
            hx-target="#career-data-section"
            hx-swap="outerHTML"
          >
            Cancel
          </button>
          <button class="btn btn-primary" type="submit">
            Save project
          </button>
        </div>
      </div>
    </form>
  )
}
