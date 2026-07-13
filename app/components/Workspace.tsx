import type { Filters, JobCardData } from '../../src/db/queries'
import { todayISO } from '../../src/lib/date'
import type { FieldErrors } from '../../src/lib/validation'
import { Field } from './Dashboard'

const query = (filters: Filters) => new URLSearchParams(filters).toString()
const err = (errors: FieldErrors | undefined, key: string) => errors?.[key]?.[0]

export function Workspace({
  job,
  filters,
  activity,
}: {
  job: JobCardData
  filters: Filters
  activity: ReturnType<typeof import('../../src/db/queries').getActivity>
}) {
  const q = query(filters)
  return (
    <div>
      <div class="mb-5 flex items-start justify-between">
        <div>
          <p class="text-sm text-base-content/60">{job.companyName}</p>
          <h2 class="text-2xl font-bold">{job.jobTitle}</h2>
          <span class="badge badge-primary mt-2">{job.status}</span>
        </div>
        <label for="workspace-toggle" class="btn btn-circle btn-ghost" aria-label="Close">
          ✕
        </label>
      </div>
      <div role="tablist" class="tabs tabs-box mb-4">
        <button
          role="tab"
          class="tab tab-active"
          hx-get={`/applications/${job.id}/application-form?${q}`}
          hx-target="#workspace-panel"
        >
          Application
        </button>
        <button
          role="tab"
          class="tab"
          onclick="document.getElementById('activity-panel').scrollIntoView()"
        >
          Activity
        </button>
      </div>
      <div id="workspace-panel">
        <ApplicationForm job={job} filters={filters} />
      </div>
      <div id="activity-panel" class="divider mt-8">
        Activity
      </div>
      <div class="grid gap-5 md:grid-cols-2">
        <ActivityForm type="follow-up" id={job.id} filters={filters} />
        <ActivityForm type="interview" id={job.id} filters={filters} />
      </div>
      <div class="mt-6 grid gap-4 md:grid-cols-2">
        <History
          title="Follow-ups"
          rows={activity.followUps.map((x) => ({
            date: x.actionDate,
            title: x.notes || 'Follow-up',
          }))}
        />
        <History
          title="Interviews"
          rows={activity.interviews.map((x) => ({
            date: x.interviewDate,
            title: x.roundName,
            notes: x.notes,
          }))}
        />
      </div>
      <div class="divider mt-8">Manage</div>
      <div class="flex flex-wrap gap-2">
        {job.status !== 'Rejected' && job.status !== 'Archived' && (
          <button
            class="btn btn-error btn-outline btn-sm"
            hx-patch={`/applications/${job.id}/status?${q}`}
            hx-vals='{"action":"reject"}'
            hx-target="#board"
            hx-swap="outerHTML"
          >
            Mark rejected
          </button>
        )}
        {job.status !== 'Archived' ? (
          <button
            class="btn btn-ghost btn-sm"
            hx-patch={`/applications/${job.id}/status?${q}`}
            hx-vals='{"action":"archive"}'
            hx-target="#board"
            hx-swap="outerHTML"
          >
            Archive
          </button>
        ) : (
          <button
            class="btn btn-success btn-outline btn-sm"
            hx-patch={`/applications/${job.id}/status?${q}`}
            hx-vals='{"action":"restore"}'
            hx-target="#board"
            hx-swap="outerHTML"
          >
            Restore
          </button>
        )}
      </div>
    </div>
  )
}

export function ApplicationForm({
  job,
  filters,
  errors,
}: {
  job: JobCardData
  filters: Filters
  errors?: FieldErrors
}) {
  return (
    <form
      id="application-form"
      hx-put={`/applications/${job.id}?${query(filters)}`}
      hx-target="#application-form"
      hx-swap="outerHTML"
      novalidate
      class="space-y-4"
    >
      <div class="grid gap-3 sm:grid-cols-2">
        <Field
          label="Job title"
          name="jobTitle"
          required
          value={job.jobTitle}
          message={err(errors, 'jobTitle')}
        />
        <Field
          label="Company"
          name="companyName"
          required
          value={job.companyName}
          message={err(errors, 'companyName')}
        />
        <Field label="Location" name="location" value={job.location} />
        <Field label="Job URL" name="url" type="url" value={job.url} message={err(errors, 'url')} />
        <Field
          label="Posted date"
          name="postedDate"
          type="date"
          required
          value={job.postedDate}
          message={err(errors, 'postedDate')}
        />
        <Field
          label="Applied date"
          name="appliedDate"
          type="date"
          value={job.appliedDate ?? todayISO()}
          message={err(errors, 'appliedDate')}
        />
        <label class="form-control">
          <span class="label-text mb-1">Priority</span>
          <select name="priority" class="select select-bordered">
            {['A', 'B', 'C'].map((x) => (
              <option selected={job.priority === x}>{x}</option>
            ))}
          </select>
        </label>
        <label class="form-control">
          <span class="label-text mb-1">Match level</span>
          <select name="matchLevel" class="select select-bordered">
            <option value="">Not set</option>
            {['A', 'B'].map((x) => (
              <option selected={job.matchLevel === x}>{x}</option>
            ))}
          </select>
        </label>
        <Field label="Resume version" name="resumeVersion" value={job.resumeVersion} />
        <Field label="Source" name="applicationSource" value={job.applicationSource} />
        <Field label="Salary" name="salary" value={job.salary} />
        <Field label="Contact" name="contact" value={job.contact} />
        <div class="sm:col-span-2">
          <Field label="Direction tags" name="tags" value={job.tags.join(', ')} />
        </div>
        <label class="form-control sm:col-span-2">
          <span class="label-text mb-1">Notes</span>
          <textarea class="textarea textarea-bordered min-h-28" name="notes">
            {job.notes ?? ''}
          </textarea>
        </label>
      </div>
      <button class="btn btn-primary w-full">🚀 Sent Application</button>
    </form>
  )
}

function ActivityForm({
  type,
  id,
  filters,
}: {
  type: 'follow-up' | 'interview'
  id: number
  filters: Filters
}) {
  const interview = type === 'interview'
  return (
    <form
      class="card bg-base-200"
      hx-post={`/applications/${id}/${interview ? 'interviews' : 'follow-ups'}?${query(filters)}`}
      hx-target="#drawer-content"
      hx-swap="innerHTML"
      novalidate
    >
      <div class="card-body p-4">
        <h3 class="font-semibold">Add {interview ? 'interview' : 'follow-up'}</h3>
        {interview && <Field label="Round" name="roundName" required />}
        <Field
          label="Date"
          name={interview ? 'interviewDate' : 'actionDate'}
          type="date"
          required
          value={todayISO()}
        />
        <label class="form-control">
          <span class="label-text mb-1">Notes</span>
          <textarea class="textarea textarea-bordered" name="notes"></textarea>
        </label>
        <button class="btn btn-secondary btn-sm mt-2">Add</button>
      </div>
    </form>
  )
}

function History({
  title,
  rows,
}: {
  title: string
  rows: { date: string; title: string; notes?: string | null }[]
}) {
  return (
    <section>
      <h3 class="mb-2 font-semibold">{title}</h3>
      {rows.length ? (
        <ul class="timeline timeline-vertical timeline-compact">
          {rows.map((row) => (
            <li>
              <div class="timeline-start text-xs">{row.date}</div>
              <div class="timeline-middle">●</div>
              <div class="timeline-end mb-4">
                <strong>{row.title}</strong>
                {row.notes && <p class="text-sm">{row.notes}</p>}
              </div>
              <hr />
            </li>
          ))}
        </ul>
      ) : (
        <p class="text-sm text-base-content/50">Nothing logged yet.</p>
      )}
    </section>
  )
}
