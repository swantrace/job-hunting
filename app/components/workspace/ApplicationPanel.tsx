import { type Filters, type JobCardData, listManagementData } from '../../../src/db/queries'
import { todayISO } from '../../../src/lib/date'
import { listProfiles } from '../../../src/lib/profiles'
import type { FieldErrors } from '../../../src/lib/validation'
import { InputField, SelectField, TextareaField } from '../ui/FormField'
import { err, query } from './helpers'

export function ApplicationPanel({
  job,
  filters,
  active = false,
}: {
  job: JobCardData
  filters: Filters
  active?: boolean
}) {
  return (
    <div
      id="workspace-application-panel"
      role="tabpanel"
      aria-labelledby="workspace-tab-application"
      data-workspace-panel
      class={active ? '' : 'hidden'}
    >
      <ApplicationForm job={job} filters={filters} />
      {job.jobPosting && (
        <details class="mt-6 rounded-box border border-base-300 p-4">
          <summary class="cursor-pointer font-semibold">Saved job post</summary>
          <pre class="mt-3 max-h-96 overflow-auto whitespace-pre-wrap text-sm">
            {job.jobPosting.rawText}
          </pre>
        </details>
      )}
      {job.jobPostingAnalysis && <JobPostAnalysis analysis={job.jobPostingAnalysis} />}
    </div>
  )
}

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
          {['A', 'B', 'C'].map((x) => (
            <option selected={job.priority === x}>{x}</option>
          ))}
        </SelectField>
        <SelectField name="matchLevel" label="Match level">
          <option value="">Not set</option>
          {['A', 'B'].map((x) => (
            <option selected={job.matchLevel === x}>{x}</option>
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
      {(job.status === 'Saved' || job.status === 'Apply Today') && (
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
      )}
    </form>
  )
}

function JobPostAnalysis({
  analysis,
}: {
  analysis: NonNullable<JobCardData['jobPostingAnalysis']>
}) {
  const fields = [
    ['Requirements', analysis.requirements],
    ['Responsibilities', analysis.responsibilities],
    ['Pain points', analysis.painPoints],
    ['Culture signals', analysis.culture],
    ['Red flags', analysis.redFlags],
    ['Success metrics', analysis.successMetrics],
    ['Benefits', analysis.benefits],
    ['Additional facts', analysis.notes],
  ] as const
  return (
    <details class="mt-4 rounded-box border border-base-300 p-4">
      <summary class="cursor-pointer font-semibold">AI job-post analysis</summary>
      <div class="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        {fields.map(([label, value]) =>
          value ? (
            <section>
              <h3 class="font-medium">{label}</h3>
              <p class="mt-1 whitespace-pre-wrap text-base-content/70">{value}</p>
            </section>
          ) : null,
        )}
      </div>
    </details>
  )
}
