import type { Filters, JobCardData } from '../../../src/db/queries'
import { todayISO } from '../../../src/lib/date'
import type { FieldErrors } from '../../../src/lib/validation'
import { InputField, TextareaField } from '../ui/FormField'
import { query, type WorkspaceErrorForm } from './helpers'

export function ActivityPanel({
  job,
  filters,
  activity,
  errors,
  errorForm,
}: {
  job: JobCardData
  filters: Filters
  activity: ReturnType<typeof import('../../../src/db/queries').getActivity>
  errors?: FieldErrors
  errorForm?: WorkspaceErrorForm
}) {
  const q = query(filters)
  return (
    <>
      <div class="grid gap-5 md:grid-cols-2">
        <ActivityForm
          type="follow-up"
          id={job.id}
          filters={filters}
          errors={errorForm === 'follow-up' ? errors : undefined}
        />
        <ActivityForm
          type="interview"
          id={job.id}
          filters={filters}
          errors={errorForm === 'interview' ? errors : undefined}
        />
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
    </>
  )
}

function ActivityForm({
  type,
  id,
  filters,
  errors,
}: {
  type: 'follow-up' | 'interview'
  id: number
  filters: Filters
  errors?: FieldErrors
}) {
  const interview = type === 'interview'
  return (
    <form
      class="card bg-base-200"
      hx-post={`/applications/${id}/${interview ? 'interviews' : 'follow-ups'}?${query(filters)}`}
      hx-target="#drawer-content"
      hx-swap="innerHTML"
      hx-disabled-elt="find button"
      novalidate
    >
      <div class="card-body p-4">
        <h3 class="font-semibold">Add {interview ? 'interview' : 'follow-up'}</h3>
        {interview && (
          <InputField label="Round" name="roundName" required error={errors?.roundName?.[0]} />
        )}
        <InputField
          label="Date"
          name={interview ? 'interviewDate' : 'actionDate'}
          type="date"
          required
          value={todayISO()}
          error={errors?.[interview ? 'interviewDate' : 'actionDate']?.[0]}
        />
        <TextareaField label="Notes" name="notes" error={errors?.notes?.[0]} />
        <button class="btn btn-secondary btn-sm mt-2">
          <span class="loading loading-spinner loading-sm htmx-indicator" /> Add
        </button>
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
