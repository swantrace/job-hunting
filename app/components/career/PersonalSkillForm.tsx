import type { CareerCatalogSkill } from '../../../src/db/career-data-view'
import { CheckboxField, InputField, TextareaField } from '../ui/FormField'
import { CareerFormAlert } from './CareerFormAlert'
import { retiredQuery } from './helpers'
import { NarrativeAttestationFields } from './NarrativeAttestationFields'
import { RelationPicker } from './RelationPicker'
import { RepeatableTextField } from './RepeatableTextField'
import { catalogSkillOptions } from './relation-options'
import type { CareerFormFeedback } from './types'

/** New records use one root id; an existing record owns its own stable root. */
export function personalSkillFormRootId(recordId: number | null): string {
  return recordId === null ? 'career-skills-form' : `career-skills-${recordId}-form`
}

/**
 * Personal skill editor. It selects an existing **approved** catalog entry and
 * then collects the candidate's own level, resume eligibility, explanation,
 * notes and evidence. It never creates or edits a catalog entry: that is the
 * separate Catalog view, and the two never imply each other.
 */
export function PersonalSkillForm({
  values,
  recordId,
  includeRetired,
  feedback,
  catalogSkills,
  linkedSkill,
}: {
  values: Record<string, string>
  recordId: number | null
  includeRetired: boolean
  feedback?: CareerFormFeedback
  catalogSkills: CareerCatalogSkill[]
  /** The catalog entry an existing personal skill points at; absent when new. */
  linkedSkill?: { id: number; name: string; key: string }
}) {
  const rootId = personalSkillFormRootId(recordId)
  const query = retiredQuery(includeRetired)
  const errors = feedback?.errors
  return (
    <form
      id={rootId}
      class="card border border-base-300 bg-base-100"
      hx-post={
        recordId === null
          ? `/career-data/skills/form${query}`
          : `/career-data/skills/${recordId}/form${query}`
      }
      hx-target={`#${rootId}`}
      hx-swap="outerHTML"
      hx-disabled-elt="find button"
      novalidate
      data-autofocus
      data-career-form="skills"
    >
      <div class="card-body gap-3 p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-lg font-semibold">
            {recordId === null ? 'Add a personal skill' : 'Edit personal skill'}
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
              hx-get={`/career-data/skills/${recordId}/form${query}`}
              hx-target={`#${rootId}`}
              hx-swap="outerHTML"
            >
              Reload the current record
            </button>
          </CareerFormAlert>
        ) : null}
        {feedback?.message ? <CareerFormAlert tone="error" title={feedback.message} /> : null}

        <input type="hidden" name="expectedRevision" value={values.expectedRevision ?? '0'} />

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Catalog entry</legend>
          <p class="label">
            A personal skill always points at an existing approved catalog entry. Adding one here
            never creates a catalog entry, and a catalog entry never creates a personal skill.
          </p>
          {linkedSkill ? (
            <>
              <input type="hidden" name="skillId" value={values.skillId ?? ''} />
              <p class="font-medium">
                {linkedSkill.name}{' '}
                <span class="badge badge-ghost badge-sm font-mono whitespace-nowrap">
                  {linkedSkill.key}
                </span>
              </p>
              <p class="label">
                The catalog entry is fixed on an existing personal skill. Rename it in the catalog
                if the label is wrong.
              </p>
            </>
          ) : (
            <RelationPicker
              id="career-skills-catalog"
              name="skillId"
              label="Approved catalog skill"
              multiple={false}
              noneLabel="Choose an approved catalog skill"
              options={catalogSkillOptions(catalogSkills)}
              value={values.skillId ?? ''}
              error={errors?.skillId?.[0]}
              required
            />
          )}
          {catalogSkills.length === 0 && !linkedSkill ? (
            <p class="text-sm text-base-content/70">
              No approved catalog skills exist yet.{' '}
              <a class="link link-primary" href="/career-data/skills?view=catalog">
                Open the Catalog view
              </a>{' '}
              to approve or create one first.
            </p>
          ) : null}
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Proficiency and eligibility</legend>
          <InputField
            name="level"
            label="Level"
            value={values.level}
            list="career-skill-level-options"
            error={errors?.level?.[0]}
            dataPrimaryInput
            help="Your own assessment; free text."
          />
          <datalist id="career-skill-level-options">
            <option value="beginner" />
            <option value="intermediate" />
            <option value="advanced" />
            <option value="expert" />
          </datalist>
          <CheckboxField
            name="resumeEligible"
            label="Eligible for resumes and documents"
            checked={values.resumeEligible === 'on'}
            error={errors?.resumeEligible?.[0]}
            help="A skill that is not resume-eligible can never prove a match."
          />
          <TextareaField
            id="career-skills-explanation"
            name="explanation"
            label="Personal explanation"
            value={values.explanation}
            rows={3}
            error={errors?.explanation?.[0]}
            help="Why you claim this skill, in your own words."
          />
          <TextareaField
            id="career-skills-notes"
            name="notes"
            label="Notes"
            value={values.notes}
            rows={2}
            error={errors?.notes?.[0]}
          />
        </fieldset>

        <NarrativeAttestationFields id="career-skills-narrative">
          <RepeatableTextField
            id="career-skills-evidence"
            name="evidence"
            label="Evidence"
            value={values.evidence ?? ''}
            error={errors?.evidence?.[0]}
            help="One note per line. Empty evidence alone never proves this skill."
          />
        </NarrativeAttestationFields>

        <div class="flex justify-end gap-2 pt-2">
          <button
            type="button"
            class="btn btn-ghost"
            hx-get={`/career-data/skills${query}`}
            hx-target="#career-data-section"
            hx-swap="outerHTML"
          >
            Cancel
          </button>
          <button class="btn btn-primary" type="submit">
            {recordId === null ? 'Add personal skill' : 'Save personal skill'}
          </button>
        </div>
      </div>
    </form>
  )
}
