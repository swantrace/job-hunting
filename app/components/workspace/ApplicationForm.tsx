import { type Filters, type JobCardData, listManagementData } from '../../../src/db/queries'
import { matchLevels, priorities } from '../../../src/lib/applications/constants'
import { todayISO } from '../../../src/lib/date'
import { listProfiles } from '../../../src/lib/profiles'
import type { FieldErrors } from '../../../src/lib/validation'
import { InputField, SelectField, TextareaField } from '../ui/FormField'
import { err, query } from './helpers'

export function ApplicationForm({
  job,
  filters,
  errors,
  companies,
  skills,
}: {
  job: JobCardData
  filters: Filters
  errors?: FieldErrors
  companies?: { name: string }[]
  skills?: { name: string }[]
}) {
  const companyOptions = companies ?? listManagementData().companies
  const skillOptions = skills ?? listManagementData().skills
  const profiles = listProfiles()
  return (
    <form
      id="application-form"
      hx-put={`/applications/${job.id}?${query(filters)}`}
      hx-target="#application-form"
      hx-swap="outerHTML"
      hx-disabled-elt="find button"
      novalidate
      class="space-y-4"
    >
      <div class="grid gap-3 sm:grid-cols-2">
        <InputField
          label="Job title"
          name="jobTitle"
          required
          value={job.jobTitle}
          error={err(errors, 'jobTitle')}
        />
        <InputField
          label="Company"
          name="companyName"
          required
          value={job.companyName}
          error={err(errors, 'companyName')}
          list="workspace-company-options"
        />
        <InputField label="Location" name="location" value={job.location} />
        <SelectField name="direction" label="Direction">
          {profiles.map((profile) => (
            <option value={profile.id} selected={job.direction === profile.id}>
              {profile.label}
            </option>
          ))}
        </SelectField>
        <InputField
          label="Job URL"
          name="url"
          type="url"
          value={job.url}
          error={err(errors, 'url')}
          externalUrl={job.url}
        />
        <InputField
          label="Posted date"
          name="postedDate"
          type="date"
          required
          value={job.postedDate}
          error={err(errors, 'postedDate')}
        />
        <InputField
          label="Applied date"
          name="appliedDate"
          type="date"
          value={job.appliedDate ?? todayISO()}
          error={err(errors, 'appliedDate')}
        />
        <SelectField name="priority" label="Priority">
          {priorities.map((value) => (
            <option selected={job.priority === value}>{value}</option>
          ))}
        </SelectField>
        <SelectField name="matchLevel" label="Match level">
          <option value="">Not set</option>
          {matchLevels.map((value) => (
            <option selected={job.matchLevel === value}>{value}</option>
          ))}
        </SelectField>
        <InputField label="Source" name="applicationSource" value={job.applicationSource} />
        <InputField label="Salary" name="salary" value={job.salary} />
        <div class="sm:col-span-2">
          <InputField
            label="Skills"
            name="skills"
            value={job.skills.join(', ')}
            list="workspace-skill-options"
          />
        </div>
        <div class="sm:col-span-2">
          <TextareaField label="Notes" name="notes" value={job.notes ?? ''} rows={5} />
        </div>
      </div>
      <datalist id="workspace-company-options">
        {companyOptions.map((company) => (
          <option value={company.name} />
        ))}
      </datalist>
      <datalist id="workspace-skill-options">
        {skillOptions.map((skill) => (
          <option value={skill.name} />
        ))}
      </datalist>
      <button class="btn btn-primary w-full" type="submit">
        <span class="loading loading-spinner loading-sm htmx-indicator" /> Save changes
      </button>
      {job.status === 'Saved' || job.status === 'Apply Today' ? (
        <button
          class="btn btn-secondary w-full"
          type="button"
          hx-patch={`/applications/${job.id}/status?${query(filters)}`}
          hx-vals='{"action":"applied"}'
          hx-target="#board"
          hx-swap="outerHTML"
          hx-disabled-elt="this"
        >
          <span class="loading loading-spinner loading-sm htmx-indicator" /> Mark as applied
        </button>
      ) : null}
    </form>
  )
}
