import type { Child } from 'hono/jsx'
import { type Filters, type JobCardData, listManagementData } from '../../src/db/queries'
import type { JobStatus } from '../../src/db/schema'
import { todayISO } from '../../src/lib/date'
import type { FieldErrors } from '../../src/lib/validation'

const activeStatuses: JobStatus[] = ['Saved', 'Apply Today', 'Applied', 'Follow Up', 'Interviewing']
const enc = (filters: Filters) => new URLSearchParams(filters).toString()
const error = (errors: FieldErrors | undefined, name: string) => errors?.[name]?.[0]

export function Metrics({
  values,
  oob = false,
}: {
  values: Partial<Record<JobStatus, number>>
  oob?: boolean
}) {
  return (
    <div
      id="metrics"
      class="stats stats-horizontal w-full overflow-x-auto bg-base-100 shadow-sm"
      {...(oob ? { 'hx-swap-oob': 'outerHTML' } : {})}
    >
      {activeStatuses.map((status) => (
        <div class="stat px-4 py-3">
          <div class="stat-title text-xs">{status}</div>
          <div class="stat-value text-2xl">{values[status] ?? 0}</div>
        </div>
      ))}
    </div>
  )
}

export function Filters({ filters }: { filters: Filters }) {
  return (
    <form
      id="filters"
      class="card bg-base-100 shadow-sm"
      hx-get="/applications"
      hx-target="#board"
      hx-swap="outerHTML"
      hx-indicator="#loading"
      hx-trigger="input changed delay:350ms from:input[name='q'], search from:input[name='q'], change from:select, change from:input[name='today']"
    >
      <div class="card-body grid gap-3 p-4 md:grid-cols-5">
        <label class="form-control md:col-span-2">
          <span class="label-text mb-1">Search</span>
          <input
            class="input input-bordered w-full"
            type="search"
            name="q"
            value={filters.q}
            placeholder="Title or company"
          />
        </label>
        <label class="form-control">
          <span class="label-text mb-1">Priority</span>
          <select class="select select-bordered" name="priority">
            <option value="">All priorities</option>
            {['A', 'B', 'C'].map((p) => (
              <option selected={filters.priority === p}>{p}</option>
            ))}
          </select>
        </label>
        <label class="form-control">
          <span class="label-text mb-1">View</span>
          <select class="select select-bordered" name="view">
            <option value="active" selected={filters.view === 'active'}>
              Active
            </option>
            <option selected={filters.view === 'Rejected'}>Rejected</option>
            <option selected={filters.view === 'Archived'}>Archived</option>
          </select>
        </label>
        <label class="form-control">
          <span class="label-text mb-1">Sort</span>
          <select class="select select-bordered" name="sort">
            {[
              ['updated_desc', 'Recently updated'],
              ['posted_desc', 'Posted: newest'],
              ['posted_asc', 'Posted: oldest'],
              ['company_asc', 'Company: A–Z'],
              ['company_desc', 'Company: Z–A'],
              ['priority_asc', 'Priority: A–C'],
              ['priority_desc', 'Priority: C–A'],
              ['target_asc', 'Today target'],
              ['applied_desc', 'Applied: newest'],
              ['applied_asc', 'Applied: oldest'],
            ].map(([v, l]) => (
              <option value={v} selected={filters.sort === v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label class="label cursor-pointer justify-start gap-3 md:col-span-5">
          <input
            class="toggle toggle-primary"
            type="checkbox"
            name="today"
            value="1"
            checked={filters.today === '1'}
          />
          <span class="label-text">Show only today’s tasks</span>
          <span id="loading" class="loading loading-spinner loading-sm htmx-indicator" />
        </label>
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
}: {
  filters: Filters
  errors?: FieldErrors
  values?: Record<string, string>
  formId?: string
  oob?: boolean
}) {
  const query = enc(filters)
  const { companies, tags } = listManagementData()
  return (
    <form
      id={formId}
      class="card bg-base-100 shadow-sm"
      hx-post={`/applications?${query}`}
      hx-target={`#${formId}`}
      hx-swap="outerHTML"
      novalidate
      {...(oob ? { 'hx-swap-oob': 'outerHTML' } : {})}
    >
      <div class="card-body p-5">
        <h2 class="card-title">Quick collect</h2>
        <p class="text-sm text-base-content/60">
          Save the lead now. Complete the details when you apply.
        </p>
        <div class="grid gap-3 sm:grid-cols-2">
          <Field
            label="Job title"
            name="jobTitle"
            required
            value={values.jobTitle}
            message={error(errors, 'jobTitle')}
          />
          <Field
            label="Company"
            name="companyName"
            required
            value={values.companyName}
            message={error(errors, 'companyName')}
            list="company-options"
          />
          <Field
            label="Location"
            name="location"
            value={values.location}
            message={error(errors, 'location')}
          />
          <Field
            label="Job URL"
            name="url"
            type="url"
            value={values.url}
            message={error(errors, 'url')}
          />
          <Field
            label="Posted date"
            name="postedDate"
            type="date"
            required
            value={values.postedDate ?? todayISO()}
            message={error(errors, 'postedDate')}
          />
          <Field label="Salary" name="salary" value={values.salary} />
          <Field
            label="Application source"
            name="applicationSource"
            value={values.applicationSource}
          />
          <div class="sm:col-span-2">
            <Field
              label="Direction tags"
              name="tags"
              value={values.tags}
              placeholder="backend, remote, fintech"
              message={error(errors, 'tags')}
              list="tag-options"
            />
          </div>
        </div>
        <div class="card-actions mt-2 justify-end">
          <button class="btn btn-primary">Save opportunity</button>
        </div>
      </div>
      {values.jobPostText && (
        <textarea name="jobPostText" class="hidden">
          {values.jobPostText}
        </textarea>
      )}
      <datalist id="company-options">
        {companies.map((company) => (
          <option value={company.name} />
        ))}
      </datalist>
      <datalist id="tag-options">
        {tags.map((tag) => (
          <option value={tag.name} />
        ))}
      </datalist>
    </form>
  )
}

export function Field({
  label,
  name,
  type = 'text',
  value,
  required,
  placeholder,
  list,
  message,
}: {
  label: string
  name: string
  type?: string
  value?: string | null
  required?: boolean
  placeholder?: string
  list?: string
  message?: string
}) {
  return (
    <label class="form-control">
      <span class="label-text mb-1">{label}</span>
      <input
        class={`input input-bordered w-full ${message ? 'input-error' : ''}`}
        name={name}
        type={type}
        value={value ?? ''}
        required={required}
        placeholder={placeholder}
        list={list}
        aria-invalid={message ? 'true' : undefined}
      />
      {message && <span class="mt-1 text-xs text-error">{message}</span>}
    </label>
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
  const statuses =
    filters.today === '1'
      ? (['Apply Today'] as const)
      : filters.view === 'active'
        ? activeStatuses
        : [filters.view as JobStatus]
  return (
    <div
      id="board"
      class={`grid w-full gap-4 ${statuses.length > 1 ? 'xl:grid-cols-5 md:grid-cols-2' : ''}`}
      aria-live="polite"
      {...(oob ? { 'hx-swap-oob': 'outerHTML' } : {})}
    >
      {statuses.map((status) => (
        <section class="board-column w-full rounded-box bg-base-300/60 p-3">
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
              {!jobs.some((job) => job.status === status) && (
                <p class="py-8 text-center text-sm text-base-content/50">No applications</p>
              )}
            </div>
          )}
        </section>
      ))}
    </div>
  )
}

function TodayTasksTable({ jobs, filters }: { jobs: JobCardData[]; filters: Filters }) {
  if (!jobs.length)
    return <p class="py-8 text-center text-sm text-base-content/50">No applications</p>
  return (
    <div class="overflow-x-auto rounded-box bg-base-100">
      <table class="table table-zebra">
        <thead>
          <tr>
            <th>Job title</th>
            <th>Company</th>
            <th>Location</th>
            <th>Priority</th>
            <th>Target date</th>
            <th>Tags</th>
            <th class="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => {
            const overdue = !!job.applyTodayTargetDate && job.applyTodayTargetDate < todayISO()
            const query = enc(filters)
            return (
              <tr>
                <td class="font-medium">{job.jobTitle}</td>
                <td>{job.companyName}</td>
                <td>{job.location || '—'}</td>
                <td>
                  <span
                    class={`badge ${job.priority === 'A' ? 'badge-error' : job.priority === 'B' ? 'badge-warning' : 'badge-ghost'}`}
                  >
                    {job.priority}
                  </span>
                </td>
                <td>
                  <span class={overdue ? 'badge badge-error badge-sm' : ''}>
                    {job.applyTodayTargetDate || '—'}
                  </span>
                </td>
                <td>
                  <div class="flex min-w-32 flex-wrap gap-1">
                    {job.tags.length
                      ? job.tags.map((tag) => (
                          <span class="badge badge-outline badge-sm">{tag}</span>
                        ))
                      : '—'}
                  </div>
                </td>
                <td>
                  <button
                    class="btn btn-primary btn-sm"
                    hx-get={`/applications/${job.id}/workspace?${query}`}
                    hx-target="#drawer-content"
                    hx-swap="innerHTML"
                    onclick="document.getElementById('workspace-toggle').checked=true"
                  >
                    Open
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
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
    <article class={`card bg-base-100 ${compact ? 'rounded-none shadow-none' : 'shadow-sm'}`}>
      <div class={`card-body gap-2 p-4 ${compact ? 'flex-col md:flex-row md:items-center' : ''}`}>
        <div class="flex items-start justify-between gap-2">
          <div>
            <h3 class="font-semibold leading-tight">{job.jobTitle}</h3>
            <p class="text-sm text-base-content/70">{job.companyName}</p>
          </div>
          <span
            class={`badge ${job.priority === 'A' ? 'badge-error' : job.priority === 'B' ? 'badge-warning' : 'badge-ghost'}`}
          >
            {job.priority}
          </span>
        </div>
        <div class="flex flex-1 flex-wrap items-center gap-2 text-xs">
          {job.location && <span>📍 {job.location}</span>}
          {overdue && (
            <span class="badge badge-error badge-sm">Overdue · {job.applyTodayTargetDate}</span>
          )}
          {job.tags.map((tag) => (
            <span class="badge badge-outline badge-sm">{tag}</span>
          ))}
        </div>
        <div class="card-actions mt-2 md:mt-0">
          <button
            class="btn btn-primary btn-sm grow"
            hx-get={`/applications/${job.id}/workspace?${query}`}
            hx-target="#drawer-content"
            hx-swap="innerHTML"
            onclick="document.getElementById('workspace-toggle').checked=true"
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

export function AppShell({ children, drawer }: { children: Child; drawer?: Child }) {
  return (
    <div class="drawer drawer-end">
      <input id="workspace-toggle" type="checkbox" class="drawer-toggle" />
      <div class="drawer-content">{children}</div>
      <div class="drawer-side z-40">
        <label for="workspace-toggle" aria-label="Close workspace" class="drawer-overlay"></label>
        <aside class="min-h-full w-full bg-base-100 p-5 sm:w-[42rem]">
          <div id="drawer-content">
            {drawer ?? <p class="text-base-content/60">Select an application.</p>}
          </div>
        </aside>
      </div>
    </div>
  )
}
