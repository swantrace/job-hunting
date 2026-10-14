import { CheckboxField, InputField, SelectField, TextareaField } from '../ui/FormField'
import { CareerFormAlert } from './CareerFormAlert'
import { DatePrecisionFields } from './DatePrecisionFields'
import { ExtensionFieldsEditor } from './ExtensionFieldsEditor'
import { httpUrl } from './helpers'
import type { CareerFormFeedback } from './types'

export const identityFormRootId = 'career-identity-candidate-form'

/**
 * Identity editor. The singleton candidate form always carries its expected
 * revision, so a stale submit becomes a 409 fragment instead of a lost update,
 * and every preserved authorization/break/rule/extension fact has an ordinary
 * control.
 */
export function IdentityForm({
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
      id={identityFormRootId}
      class="card border border-base-300 bg-base-100"
      hx-post="/career-data/identity/form"
      hx-target={`#${identityFormRootId}`}
      hx-swap="outerHTML"
      hx-disabled-elt="find button"
      novalidate
      data-autofocus
      data-career-form="identity"
    >
      <div class="card-body gap-3 p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-lg font-semibold">{exists ? 'Edit identity' : 'Add your identity'}</h2>
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
              hx-get="/career-data/identity/form"
              hx-target={`#${identityFormRootId}`}
              hx-swap="outerHTML"
            >
              Reload the current record
            </button>
          </CareerFormAlert>
        ) : null}
        {feedback?.message ? <CareerFormAlert tone="error" title={feedback.message} /> : null}

        <input type="hidden" name="expectedRevision" value={values.expectedRevision ?? '0'} />

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Contact details</legend>
          <InputField
            name="fullName"
            label="Full name"
            value={values.fullName}
            required
            error={errors?.fullName?.[0]}
            dataPrimaryInput
          />
          <InputField
            name="email"
            label="Email"
            type="email"
            value={values.email}
            error={errors?.email?.[0]}
          />
          <InputField name="phone" label="Phone" value={values.phone} error={errors?.phone?.[0]} />
          <InputField
            name="location"
            label="Location"
            value={values.location}
            error={errors?.location?.[0]}
          />
          <InputField
            name="website"
            label="Website"
            value={values.website}
            error={errors?.website?.[0]}
            externalUrl={httpUrl(values.website)}
          />
          <InputField
            name="linkedinUrl"
            label="LinkedIn"
            value={values.linkedinUrl}
            error={errors?.linkedinUrl?.[0]}
            externalUrl={httpUrl(values.linkedinUrl)}
          />
          <InputField
            name="githubUrl"
            label="GitHub"
            value={values.githubUrl}
            error={errors?.githubUrl?.[0]}
            externalUrl={httpUrl(values.githubUrl)}
          />
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Work authorization</legend>
          <InputField
            name="workAuthorization"
            label="Work authorization"
            value={values.workAuthorization}
            error={errors?.workAuthorization?.[0]}
            help="For example: citizen, permanent resident or a named permit."
          />
          <SelectField
            name="requiresSponsorship"
            label="Requires sponsorship"
            error={errors?.requiresSponsorship?.[0]}
          >
            <option value="" selected={values.requiresSponsorship === ''}>
              Not recorded
            </option>
            <option value="no" selected={values.requiresSponsorship === 'no'}>
              No
            </option>
            <option value="yes" selected={values.requiresSponsorship === 'yes'}>
              Yes
            </option>
          </SelectField>
          <TextareaField
            name="authorizationNotes"
            label="Authorization notes"
            value={values.authorizationNotes}
            rows={3}
            error={errors?.authorizationNotes?.[0]}
          />
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Career break</legend>
          <SelectField
            name="hasCareerBreak"
            label="Career break"
            error={errors?.hasCareerBreak?.[0]}
            help="Left unrecorded until you choose; a break is never inferred."
          >
            <option value="" selected={values.hasCareerBreak === ''}>
              Not recorded
            </option>
            <option value="no" selected={values.hasCareerBreak === 'no'}>
              No career break
            </option>
            <option value="yes" selected={values.hasCareerBreak === 'yes'}>
              Yes, there is a break
            </option>
          </SelectField>
          <DatePrecisionFields
            idPrefix="career-break"
            startName="careerBreakStartDate"
            endName="careerBreakEndDate"
            precisionName="careerBreakPrecision"
            values={values}
            errors={errors}
            startLabel="Break start"
            endLabel="Break end"
          />
          <TextareaField
            name="careerBreakReason"
            label="Break reason"
            value={values.careerBreakReason}
            rows={3}
            error={errors?.careerBreakReason?.[0]}
          />
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Truthfulness rules</legend>
          <CheckboxField
            name="neverClaimUnexperiencedSkill"
            label="Never claim a skill without experience"
            checked={values.neverClaimUnexperiencedSkill === 'on'}
            error={errors?.neverClaimUnexperiencedSkill?.[0]}
          />
          <CheckboxField
            name="requireAccurateDates"
            label="Require accurate dates"
            checked={values.requireAccurateDates === 'on'}
            error={errors?.requireAccurateDates?.[0]}
          />
          <TextareaField
            name="truthfulnessNotes"
            label="Rule notes"
            value={values.truthfulnessNotes}
            rows={3}
            error={errors?.truthfulnessNotes?.[0]}
          />
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Extension fields</legend>
          <ExtensionFieldsEditor
            id="career-identity-extensions"
            value={values.extensionFields ?? ''}
            error={errors?.extensionFields?.[0]}
          />
        </fieldset>

        <div class="flex justify-end gap-2 pt-2">
          <button
            type="button"
            class="btn btn-ghost"
            hx-get="/career-data/identity"
            hx-target="#career-data-section"
            hx-swap="outerHTML"
          >
            Cancel
          </button>
          <button class="btn btn-primary" type="submit">
            Save identity
          </button>
        </div>
      </div>
    </form>
  )
}
