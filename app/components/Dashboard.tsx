import type { JobAnalysis } from '../../src/ai/schemas/job-analysis'
import { type Filters, type JobCardData, listManagementData } from '../../src/db/queries'
import {
  activeStatuses,
  applicationSortLabels,
  applicationSortValues,
  applicationViewLabels,
  applicationViews,
  type JobStatus,
  priorities,
  statuses,
} from '../../src/lib/applications/constants'
import { formatDisplayDate, todayISO } from '../../src/lib/date'
import { listProfiles } from '../../src/lib/profiles'
import {
  type ApplicationAttribute,
  applicationAttributeLabels,
  applicationAttributes,
  defaultAttributes,
  type FieldErrors,
  parseCsvList,
  statusesFromFilters,
} from '../../src/lib/validation'
import { JobAnalysisDraft } from './JobAnalysisDraft'
import { EmptyState } from './ui/EmptyState'
import { InputField, SelectField } from './ui/FormField'
import { Icon } from './ui/Icon'
import { StatusBadge } from './ui/StatusBadge'

const enc = (filters: Filters) => new URLSearchParams(filters).toString()
const error = (errors: FieldErrors | undefined, name: string) => errors?.[name]?.[0]
export function Filters({ filters }: { filters: Filters }) {
  const selectedStatuses = parseCsvList(filters.statuses).length
    ? (parseCsvList(filters.statuses) as JobStatus[])
    : ([...activeStatuses] as JobStatus[])
  const attributes = parseAttributes(filters.attributes)
  return (
    <form
      id="filters"
      class="card border border-base-300 bg-base-100"
      hx-get="/applications"
      hx-target="#board"
      hx-swap="outerHTML"
      hx-push-url="true"
      hx-sync="this:replace"
      hx-indicator="#loading"
      hx-trigger="input changed delay:350ms from:input[name='q'], search from:input[name='q'], change from:select, change from:input[name='statuses'], change from:input[name='attributes'], change from:input[name='today']"
    >
      <div class="card-body gap-4 p-4 sm:p-5">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 class="font-semibold">Filter applications</h2>
            <p class="text-sm text-base-content/60">Search and refine the applications below.</p>
          </div>
          <a class="btn btn-ghost btn-sm" href="/applications">
            Clear all
          </a>
        </div>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-12">
          <div class="sm:col-span-2 lg:col-span-4">
            <InputField
              name="q"
              label="Search"
              type="search"
              value={filters.q}
              placeholder="Title or company"
            />
          </div>
          <div class="lg:col-span-2">
            <SelectField name="view" label="View">
              {applicationViews.map((view) => (
                <option value={view} selected={filters.view === view}>
                  {applicationViewLabels[view]}
                </option>
              ))}
            </SelectField>
          </div>
          <div class="lg:col-span-2">
            <SelectField name="priority" label="Priority">
              <option value="">All priorities</option>
              {priorities.map((p) => (
                <option selected={filters.priority === p}>{p}</option>
              ))}
            </SelectField>
          </div>
          <div class="lg:col-span-2">
            <SelectField name="sort" label="Sort by">
              {applicationSortValues.map((sort) => (
                <option value={sort} selected={filters.sort === sort}>
                  {applicationSortLabels[sort]}
                </option>
              ))}
            </SelectField>
          </div>
          <fieldset class="fieldset lg:col-span-2">
            <legend class="fieldset-legend">Columns</legend>
            <details class="dropdown dropdown-end w-full">
              <summary class="btn w-full justify-between border-base-300 bg-base-100 font-normal">
                <span>Choose columns</span>
                <Icon name="chevronDown" />
              </summary>
              <div class="dropdown-content z-30 mt-2 w-72 rounded-box border border-base-300 bg-base-100 p-3 shadow-lg">
                <p class="px-2 pb-2 text-sm font-semibold">Visible columns</p>
                <div class="grid grid-cols-2 gap-1">
                  {applicationAttributes.map((attr) => (
                    <label class="label cursor-pointer justify-start gap-2 rounded-lg px-2 py-2 hover:bg-base-200">
                      <input
                        type="checkbox"
                        class="checkbox checkbox-sm"
                        name="attributes"
                        value={attr}
                        checked={attributes.includes(attr)}
                      />
                      <span class="text-sm">{applicationAttributeLabels[attr]}</span>
                    </label>
                  ))}
                </div>
              </div>
            </details>
          </fieldset>
          <div class="sm:col-span-2 lg:col-span-9">
            <fieldset class="fieldset">
              <legend class="fieldset-legend">Status</legend>
              <div class="flex flex-wrap gap-x-4 gap-y-2">
                {statuses.map((status) => (
                  <label class="label cursor-pointer gap-2">
                    <input
                      type="checkbox"
                      class="checkbox checkbox-sm"
                      name="statuses"
                      value={status}
                      checked={selectedStatuses.includes(status)}
                    />
                    <span class="text-sm">{status}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          <div class="flex items-end lg:col-span-3 lg:justify-end">
            <label class="label min-h-12 cursor-pointer justify-start gap-3 lg:justify-end">
              <input
                class="toggle toggle-primary"
                type="checkbox"
                name="today"
                value="1"
                checked={filters.today === '1'}
              />
              <span>Due today only</span>
              <span id="loading" class="loading loading-spinner loading-sm htmx-indicator" />
            </label>
          </div>
        </div>
      </div>
    </form>
  )
}

export function QuickCollect({
  filters,
  errors,
  values = {},
  formId = 'quick-form',
  oob = false,
  jobAnalysis,
}: {
  filters: Filters
  errors?: FieldErrors
  values?: Record<string, string>
  formId?: string
  oob?: boolean
  jobAnalysis?: JobAnalysis
}) {
  const query = enc(filters)
  const { companies, skills } = listManagementData()
  const profiles = listProfiles()
  return (
    <form
      id={formId}
      class="card bg-base-100 shadow-sm"
      hx-post={`/applications?${query}`}
      hx-target={`#${formId}`}
      hx-swap="outerHTML"
      hx-disabled-elt="find button"
      novalidate
      {...(oob ? { 'hx-swap-oob': 'outerHTML' } : {})}
    >
      <div class="card-body p-5">
        <h2 class="card-title">Quick collect</h2>
        <p class="text-sm text-base-content/60">
          Save the lead now. Complete the details when you apply.
        </p>
        <div class="grid gap-3 sm:grid-cols-2">
          <InputField
            label="Job title"
            name="jobTitle"
            required
            value={values.jobTitle}
            error={error(errors, 'jobTitle')}
          />
          <InputField
            label="Company"
            name="companyName"
            required
            value={values.companyName}
            error={error(errors, 'companyName')}
            list="company-options"
          />
          <SelectField
            name="direction"
            label="Direction"
            required
            error={error(errors, 'direction')}
          >
            <option value="">Choose a direction</option>
            {profiles.map((profile) => (
              <option value={profile.id} selected={values.direction === profile.id}>
                {profile.label}
              </option>
            ))}
          </SelectField>
          <InputField
            label="Location"
            name="location"
            value={values.location}
            error={error(errors, 'location')}
          />
          <InputField
            label="Job URL"
            name="url"
            type="url"
            value={values.url}
            error={error(errors, 'url')}
          />
          <InputField
            label="Posted date"
            name="postedDate"
            type="date"
            required
            value={values.postedDate ?? todayISO()}
            error={error(errors, 'postedDate')}
          />
          <InputField label="Salary" name="salary" value={values.salary} />
          <InputField
            label="Application source"
            name="applicationSource"
            value={values.applicationSource}
          />
          <div class="sm:col-span-2">
            <InputField
              label="Skills"
              name="skills"
              value={values.skills}
              placeholder="react, typescript, fhir"
              error={error(errors, 'skills')}
              list="skill-options"
            />
          </div>
        </div>
        {jobAnalysis ? <JobAnalysisDraft analysis={jobAnalysis} /> : null}
        <div class="card-actions mt-2 justify-end">
          <button class="btn btn-primary">
            <span class="loading loading-spinner loading-sm htmx-indicator" /> Save opportunity
          </button>
        </div>
      </div>
      {values.jobPostText && (
        <textarea name="jobPostText" class="hidden">
          {values.jobPostText}
        </textarea>
      )}
      {values.parserModel && <input type="hidden" name="parserModel" value={values.parserModel} />}
      {values.parserPromptVersion && (
        <input type="hidden" name="parserPromptVersion" value={values.parserPromptVersion} />
      )}
      {values.analysisSchemaVersion && (
        <input type="hidden" name="analysisSchemaVersion" value={values.analysisSchemaVersion} />
      )}
      {values.analysisPromptVersion && (
        <input type="hidden" name="analysisPromptVersion" value={values.analysisPromptVersion} />
      )}
      <datalist id="company-options">
        {companies.map((company) => (
          <option value={company.name} />
        ))}
      </datalist>
      <datalist id="skill-options">
        {skills.map((skill) => (
          <option value={skill.name} />
        ))}
      </datalist>
    </form>
  )
}

export function Board({
  jobs,
  filters,
  oob = false,
}: {
  jobs: JobCardData[]
  filters: Filters
  oob?: boolean
}) {
  return (
    <section
      id="board"
      class="mt-5"
      aria-live="polite"
      {...(oob ? { 'hx-swap-oob': 'outerHTML' } : {})}
    >
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
        <p class="text-sm text-base-content/70">
          <span class="font-semibold text-base-content">{jobs.length}</span> application
          {jobs.length === 1 ? '' : 's'} found
        </p>
        <span class="badge badge-ghost badge-sm">
          {filters.today === '1'
            ? 'Due today'
            : filters.view === 'board'
              ? 'Board view'
              : 'List view'}
        </span>
      </div>
      {filters.view === 'board' ? (
        <KanbanBoard jobs={jobs} filters={filters} />
      ) : (
        <ListBoard jobs={jobs} filters={filters} />
      )}
    </section>
  )
}

function KanbanBoard({ jobs, filters }: { jobs: JobCardData[]; filters: Filters }) {
  const statuses = statusesFromFilters(filters)
  return (
    <div class="flex w-full flex-row items-start gap-4 overflow-x-auto pb-2">
      {statuses.map((status) => (
        <section
          class={`board-column rounded-box bg-base-300/60 p-3 ${
            statuses.length === 1 ? 'w-full shrink-0' : 'w-77.5 min-w-77.5 shrink-0'
          }`}
        >
          <div class="mb-3 flex items-center justify-between">
            <h2 class="font-semibold">{status}</h2>
            <span class="badge badge-neutral">
              {jobs.filter((job) => job.status === status).length}
            </span>
          </div>
          {filters.today === '1' ? (
            <TodayTasksTable jobs={jobs.filter((job) => job.status === status)} filters={filters} />
          ) : (
            <div class="space-y-3">
              {jobs
                .filter((job) => job.status === status)
                .map((job) => (
                  <JobCard job={job} filters={filters} />
                ))}
              {!jobs.some((job) => job.status === status) && <EmptyState title="No applications" />}
            </div>
          )}
        </section>
      ))}
    </div>
  )
}

const parseAttributes = (value?: string): ApplicationAttribute[] => {
  const selected = parseCsvList(value).filter((item): item is ApplicationAttribute =>
    (applicationAttributes as readonly string[]).includes(item),
  )
  return selected.length ? selected : [...defaultAttributes]
}

function ListBoard({ jobs, filters }: { jobs: JobCardData[]; filters: Filters }) {
  const attributes = parseAttributes(filters.attributes)
  const query = enc(filters)
  return (
    <div class="overflow-hidden rounded-box border border-base-300 bg-base-100">
      {jobs.length ? (
        <>
          <div class="hidden overflow-x-auto md:block">
            <table class="table table-sm">
              <caption class="sr-only">Job applications</caption>
              <thead>
                <tr>
                  {attributes.map((attr) => (
                    <th class={attr === 'title' ? 'min-w-48' : undefined}>
                      {applicationAttributeLabels[attr]}
                    </th>
                  ))}
                  <th class="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr class="border-base-200 hover:bg-base-200/50">
                    {attributes.map((attr) => (
                      <td>{renderCell(job, attr)}</td>
                    ))}
                    <td class="text-right">
                      <button
                        class="btn btn-ghost btn-sm"
                        hx-get={`/applications/${job.id}/workspace?${query}`}
                        hx-target="#drawer-content"
                        hx-swap="innerHTML"
                        data-open-workspace
                        aria-label={`View ${job.jobTitle} at ${job.companyName}`}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div class="divide-y divide-base-200 md:hidden">
            {jobs.map((job) => (
              <MobileApplicationRow job={job} query={query} />
            ))}
          </div>
        </>
      ) : (
        <EmptyState
          title="No applications"
          description="Adjust the filters or add a new application."
        />
      )}
    </div>
  )
}

function MobileApplicationRow({
  job,
  query,
  showTargetDate = false,
}: {
  job: JobCardData
  query: string
  showTargetDate?: boolean
}) {
  const date = showTargetDate ? job.applyTodayTargetDate : job.appliedDate
  const overdue =
    showTargetDate && !!job.applyTodayTargetDate && job.applyTodayTargetDate < todayISO()
  return (
    <article class="p-4">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="truncate text-sm text-base-content/60">{job.companyName}</p>
          <h3 class="mt-0.5 font-semibold">
            <span>{job.jobTitle}</span>
            {job.url ? (
              <a
                class="ms-1 inline-flex align-middle"
                href={job.url}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open ${job.jobTitle} posting`}
              >
                <Icon name="external" className="size-3.5" />
              </a>
            ) : null}
          </h3>
        </div>
        <StatusBadge status={job.status} />
      </div>
      <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-base-content/70">
        <PriorityBadge priority={job.priority} small />
        {job.location ? (
          <span class="inline-flex items-center gap-1">
            <Icon name="location" className="size-3.5" /> {job.location}
          </span>
        ) : null}
        {date ? (
          <span class={overdue ? 'font-medium text-error' : undefined}>
            {showTargetDate ? 'Target' : 'Applied'} · {formatDisplayDate(date)}
          </span>
        ) : null}
      </div>
      <div class="mt-3 flex justify-end">
        <button
          class="btn btn-ghost btn-sm"
          hx-get={`/applications/${job.id}/workspace?${query}`}
          hx-target="#drawer-content"
          hx-swap="innerHTML"
          data-open-workspace
        >
          View details
        </button>
      </div>
    </article>
  )
}

function PriorityBadge({
  priority,
  small = false,
}: {
  priority: JobCardData['priority']
  small?: boolean
}) {
  return (
    <span
      class={`badge badge-outline min-w-20 shrink-0 justify-center whitespace-nowrap ${
        small ? 'badge-sm' : ''
      }`}
    >
      Priority {priority}
    </span>
  )
}

function renderCell(job: JobCardData, attr: ApplicationAttribute) {
  switch (attr) {
    case 'company':
      return job.companyWebsite ? (
        <a class="link font-medium" href={job.companyWebsite} target="_blank" rel="noreferrer">
          {job.companyName}
        </a>
      ) : (
        <span class="font-medium">{job.companyName}</span>
      )
    case 'title':
      return (
        <span class="inline-flex items-center gap-1">
          <span class="font-medium">{job.jobTitle}</span>
          {job.url && (
            <a
              class="link"
              href={job.url}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${job.jobTitle} posting`}
            >
              <Icon name="external" className="size-3.5" />
            </a>
          )}
        </span>
      )
    case 'location':
      return job.location || '—'
    case 'priority':
      return <PriorityBadge priority={job.priority} />
    case 'status':
      return <StatusBadge status={job.status} />
    case 'appliedDate':
      return job.appliedDate ? formatDisplayDate(job.appliedDate) : '—'
    case 'targetDate':
      return job.applyTodayTargetDate ? formatDisplayDate(job.applyTodayTargetDate) : '—'
    case 'source':
      return job.applicationSource || '—'
    case 'matchLevel':
      return job.matchLevel || '—'
    case 'notes':
      return <span class="block max-w-xs truncate">{job.notes || '—'}</span>
  }
}

function TodayTasksTable({ jobs, filters }: { jobs: JobCardData[]; filters: Filters }) {
  if (!jobs.length) return <EmptyState title="Nothing due today" />
  const query = enc(filters)
  return (
    <div class="overflow-hidden rounded-box border border-base-300 bg-base-100">
      <div class="hidden overflow-x-auto md:block">
        <table class="table table-sm">
          <caption class="sr-only">Applications due today</caption>
          <thead>
            <tr>
              <th>Job title</th>
              <th>Company</th>
              <th>Location</th>
              <th>Priority</th>
              <th>Target date</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => {
              const overdue = !!job.applyTodayTargetDate && job.applyTodayTargetDate < todayISO()
              return (
                <tr class="border-base-200 hover:bg-base-200/50">
                  <td class="font-medium">
                    {job.jobTitle}
                    {job.url && (
                      <a
                        class="ml-1 inline-flex align-middle"
                        href={job.url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Open ${job.jobTitle} posting`}
                      >
                        <Icon name="external" className="size-3.5" />
                      </a>
                    )}
                  </td>
                  <td>{job.companyName}</td>
                  <td>{job.location || '—'}</td>
                  <td>
                    <PriorityBadge priority={job.priority} />
                  </td>
                  <td>
                    <span class={overdue ? 'badge badge-error badge-sm' : ''}>
                      {job.applyTodayTargetDate ? formatDisplayDate(job.applyTodayTargetDate) : '—'}
                    </span>
                  </td>
                  <td class="text-right">
                    <button
                      class="btn btn-ghost btn-sm"
                      hx-get={`/applications/${job.id}/workspace?${query}`}
                      hx-target="#drawer-content"
                      hx-swap="innerHTML"
                      data-open-workspace
                    >
                      View
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div class="divide-y divide-base-200 md:hidden">
        {jobs.map((job) => (
          <MobileApplicationRow job={job} query={query} showTargetDate />
        ))}
      </div>
    </div>
  )
}

function JobCard({
  job,
  filters,
  compact = false,
}: {
  job: JobCardData
  filters: Filters
  compact?: boolean
}) {
  const overdue =
    job.status === 'Apply Today' &&
    !!job.applyTodayTargetDate &&
    job.applyTodayTargetDate < todayISO()
  const query = enc(filters)
  return (
    <article class="card border border-base-300/40 bg-base-100 p-4 shadow-sm">
      <div class={`card-body gap-2 p-0 ${compact ? 'flex-col md:flex-row md:items-center' : ''}`}>
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="flex items-center gap-1">
              <h3 class="font-semibold leading-tight">{job.jobTitle}</h3>
              {job.url && (
                <a
                  class="link"
                  href={job.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open ${job.jobTitle} posting`}
                >
                  <Icon name="external" className="size-3.5" />
                </a>
              )}
            </div>
            <p class="text-sm text-base-content/70">{job.companyName}</p>
          </div>
          <PriorityBadge priority={job.priority} />
        </div>
        <div class="flex flex-1 flex-wrap items-center gap-2 text-xs">
          {job.location && (
            <span class="inline-flex items-center gap-1">
              <Icon name="location" className="size-3.5" /> {job.location}
            </span>
          )}
          {overdue && (
            <span class="badge badge-error badge-sm">
              Overdue · {formatDisplayDate(job.applyTodayTargetDate!)}
            </span>
          )}
        </div>
        <div class="card-actions mt-2 md:mt-0">
          <button
            class="btn btn-sm grow"
            hx-get={`/applications/${job.id}/workspace?${query}`}
            hx-target="#drawer-content"
            hx-swap="innerHTML"
            data-open-workspace
          >
            Open
          </button>
          {job.status === 'Saved' && (
            <button
              class="btn btn-ghost btn-sm"
              hx-patch={`/applications/${job.id}/status?${query}`}
              hx-vals='{"action":"today"}'
              hx-target="#board"
              hx-swap="outerHTML"
            >
              Today
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

export { Metrics } from './dashboard/Metrics'
export { WorkspaceDrawer } from './dashboard/WorkspaceDrawer'
