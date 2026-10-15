import type { CareerCatalogSkill } from '../../../src/db/career-data-view'
import type { CareerDirectionRecord } from '../../../src/db/career-directions'
import type {
  CareerExperienceRecord,
  CareerPublicationRecord,
} from '../../../src/db/career-records'
import { CheckboxField, InputField } from '../ui/FormField'
import { CareerFormAlert } from './CareerFormAlert'
import { retiredQuery } from './helpers'
import { NarrativeAttestationFields } from './NarrativeAttestationFields'
import { RelationPicker } from './RelationPicker'
import { RepeatableTextField } from './RepeatableTextField'
import {
  catalogSkillOptions,
  directionOptions,
  experienceOptions,
  publicationOptions,
} from './relation-options'
import type { CareerFormFeedback } from './types'

/** New records use one root id; an existing record owns its own stable root. */
export function achievementFormRootId(recordId: number | null): string {
  return recordId === null ? 'career-achievements-form' : `career-achievements-${recordId}-form`
}

/**
 * Achievement editor. Claim and safety come first, then the validated source
 * links (experience, catalog skills, directions, publications) and finally the
 * narrative attestation, so a reader always knows which part is a checked
 * reference and which part is the candidate's own account.
 */
export function AchievementForm({
  values,
  recordId,
  stableKey,
  includeRetired,
  feedback,
  experiences,
  directions,
  publications,
  catalogSkills,
}: {
  values: Record<string, string>
  recordId: number | null
  stableKey?: string
  includeRetired: boolean
  feedback?: CareerFormFeedback
  experiences: CareerExperienceRecord[]
  directions: CareerDirectionRecord[]
  publications: CareerPublicationRecord[]
  catalogSkills: CareerCatalogSkill[]
}) {
  const rootId = achievementFormRootId(recordId)
  const query = retiredQuery(includeRetired)
  const errors = feedback?.errors
  return (
    <form
      id={rootId}
      class="card border border-base-300 bg-base-100"
      hx-post={
        recordId === null
          ? `/career-data/achievements/form${query}`
          : `/career-data/achievements/${recordId}/form${query}`
      }
      hx-target={`#${rootId}`}
      hx-swap="outerHTML"
      hx-disabled-elt="find button"
      novalidate
      data-autofocus
      data-career-form="achievements"
    >
      <div class="card-body gap-3 p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-lg font-semibold">
            {recordId === null ? 'New achievement' : 'Edit achievement'}
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
              hx-get={`/career-data/achievements/${recordId}/form${query}`}
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
          <legend class="fieldset-legend">Claim</legend>
          <InputField
            name="claim"
            label="Claim"
            value={values.claim}
            required
            maxLength={500}
            error={errors?.claim?.[0]}
            dataPrimaryInput
            help="One verifiable statement. Do not combine several unrelated outcomes."
          />
          <CheckboxField
            name="safeToUse"
            label="Safe to use in documents"
            checked={values.safeToUse === 'on'}
            error={errors?.safeToUse?.[0]}
            help="Unsafe claims are excluded from every generated document and evidence allowlist."
          />
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Validated source links</legend>
          <p class="label">
            References are checked against your career data. A retired experience cannot be linked.
          </p>
          <RelationPicker
            id="career-achievements-experience"
            name="experienceId"
            label="Experience"
            multiple={false}
            noneLabel="No experience link"
            options={experienceOptions(experiences)}
            value={values.experienceId ?? ''}
            error={errors?.experienceId?.[0]}
            help="The role this achievement happened in."
          />
          <RelationPicker
            id="career-achievements-skills"
            name="skills"
            label="Catalog skills"
            options={catalogSkillOptions(catalogSkills)}
            value={values.skills ?? ''}
            error={errors?.skills?.[0]}
            help="Only approved catalog skills can back an achievement."
          />
          <RelationPicker
            id="career-achievements-directions"
            name="directions"
            label="Directions"
            options={directionOptions(directions)}
            value={values.directions ?? ''}
            error={errors?.directions?.[0]}
          />
          <RelationPicker
            id="career-achievements-publications"
            name="publicationIds"
            label="Publications"
            options={publicationOptions(publications)}
            value={values.publicationIds ?? ''}
            error={errors?.publicationIds?.[0]}
            emptyMessage="No publications recorded yet."
          />
        </fieldset>

        <NarrativeAttestationFields id="career-achievements-narrative">
          <RepeatableTextField
            id="career-achievements-evidence"
            name="evidence"
            label="Evidence notes"
            value={values.evidence ?? ''}
            error={errors?.evidence?.[0]}
            help="One note per line. Describe where the claim can be checked; kept as narrative, not a verified link."
          />
          <RepeatableTextField
            id="career-achievements-evidence-narratives"
            name="evidenceNarratives"
            label="Evidence narratives"
            value={values.evidenceNarratives ?? ''}
            error={errors?.evidenceNarratives?.[0]}
            help="One narrative per line. Your own account of what happened."
          />
          <RepeatableTextField
            id="career-achievements-limitations"
            name="limitations"
            label="Limitations"
            value={values.limitations ?? ''}
            error={errors?.limitations?.[0]}
            help="One limitation per line. State what the claim does not cover."
          />
        </NarrativeAttestationFields>

        <div class="flex justify-end gap-2 pt-2">
          <button
            type="button"
            class="btn btn-ghost"
            hx-get={`/career-data/achievements${query}`}
            hx-target="#career-data-section"
            hx-swap="outerHTML"
          >
            Cancel
          </button>
          <button class="btn btn-primary" type="submit">
            Save achievement
          </button>
        </div>
      </div>
    </form>
  )
}
