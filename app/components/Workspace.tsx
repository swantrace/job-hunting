import { applicationGenerationPromptVersion } from '../../src/ai/prompts/application-generation'
import {
  type GenerationRunWithArtifacts,
  getGenerationEvidenceSnapshot,
  getGoogleDriveConnection,
  listGenerationRuns,
} from '../../src/db/generation'
import { type Filters, type JobCardData, listManagementData } from '../../src/db/queries'
import { todayISO } from '../../src/lib/date'
import {
  type EvidenceSelectionSnapshot,
  evidenceSelectionSnapshotSchema,
} from '../../src/lib/evidence-selection'
import { listProfiles } from '../../src/lib/profiles'
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
  const { companies, skills } = listManagementData()
  const generationRuns = listGenerationRuns(job.id)
  const latestEvidenceSnapshot = generationRuns[0]
    ? getGenerationEvidenceSnapshot(generationRuns[0].id)
    : null
  const googleDriveConnected = !!getGoogleDriveConnection()
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
          data-workspace-tab="application"
          aria-selected="true"
          onclick="const tab=this.dataset.workspaceTab; document.querySelectorAll('[data-workspace-panel]').forEach((panel)=>panel.classList.toggle('hidden',panel.id!==`workspace-${tab}-panel`)); document.querySelectorAll('[data-workspace-tab]').forEach((button)=>{button.classList.toggle('tab-active',button===this);button.setAttribute('aria-selected',button===this?'true':'false')})"
          hx-get={`/applications/${job.id}/application-form?${q}`}
          hx-target="#workspace-application-panel"
        >
          Application
        </button>
        <button
          role="tab"
          class="tab"
          data-workspace-tab="contacts"
          aria-selected="false"
          onclick="const tab=this.dataset.workspaceTab; document.querySelectorAll('[data-workspace-panel]').forEach((panel)=>panel.classList.toggle('hidden',panel.id!==`workspace-${tab}-panel`)); document.querySelectorAll('[data-workspace-tab]').forEach((button)=>{button.classList.toggle('tab-active',button===this);button.setAttribute('aria-selected',button===this?'true':'false')})"
        >
          Contacts
        </button>
        <button
          role="tab"
          class="tab"
          data-workspace-tab="activity"
          aria-selected="false"
          onclick="const tab=this.dataset.workspaceTab; document.querySelectorAll('[data-workspace-panel]').forEach((panel)=>panel.classList.toggle('hidden',panel.id!==`workspace-${tab}-panel`)); document.querySelectorAll('[data-workspace-tab]').forEach((button)=>{button.classList.toggle('tab-active',button===this);button.setAttribute('aria-selected',button===this?'true':'false')})"
        >
          Activity
        </button>
      </div>
      <div id="workspace-application-panel" data-workspace-panel>
        <ApplicationForm job={job} filters={filters} companies={companies} skills={skills} />
        {job.jobPosting && (
          <details class="mt-6 rounded-box border border-base-300 p-4">
            <summary class="cursor-pointer font-semibold">Saved job post</summary>
            <pre class="mt-3 max-h-96 overflow-auto whitespace-pre-wrap text-sm">
              {job.jobPosting.rawText}
            </pre>
          </details>
        )}
        {job.jobPostingAnalysis && <JobPostAnalysis analysis={job.jobPostingAnalysis} />}
        <GenerationPanel
          jobId={job.id}
          filters={filters}
          runs={generationRuns}
          evidenceSnapshot={latestEvidenceSnapshot?.snapshotJson ?? null}
          googleDriveConnected={googleDriveConnected}
        />
      </div>
      <div id="workspace-contacts-panel" data-workspace-panel class="hidden">
        <ContactsSection job={job} filters={filters} />
      </div>
      <div id="workspace-activity-panel" data-workspace-panel class="hidden">
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
    </div>
  )
}

export function GenerationPanel({
  jobId,
  filters,
  runs,
  evidenceSnapshot,
  googleDriveConnected,
}: {
  jobId: number
  filters: Filters
  runs: GenerationRunWithArtifacts[]
  evidenceSnapshot: string | null
  googleDriveConnected: boolean
}) {
  const latest = runs[0]
  const statusClass =
    latest?.status === 'Completed'
      ? 'badge-success'
      : latest?.status === 'Failed'
        ? 'badge-error'
        : latest?.status === 'Processing'
          ? 'badge-warning'
          : 'badge-info'
  const shouldPoll = latest?.status === 'Queued' || latest?.status === 'Processing'
  const snapshot = parseEvidenceSnapshot(evidenceSnapshot)
  return (
    <section
      id="generation-panel"
      class="mt-6 rounded-box border border-base-300 p-4"
      {...(shouldPoll
        ? {
            'hx-get': `/applications/${jobId}/generation-runs?${query(filters)}`,
            'hx-trigger': 'every 3s',
            'hx-swap': 'outerHTML',
          }
        : {})}
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 class="font-semibold">Application documents</h3>
          <p class="text-sm text-base-content/60">
            Generate a structured job context, tailored resume, and cover letter.
          </p>
        </div>
        <form
          hx-post={`/applications/${jobId}/generation-runs?${query(filters)}`}
          hx-target="#generation-panel"
          hx-swap="outerHTML"
          hx-disabled-elt="find button"
        >
          <button class="btn btn-secondary btn-sm">
            <span class="loading loading-spinner loading-xs htmx-indicator" />
            {latest?.status === 'Failed' ? 'Retry generation' : 'Generate documents'}
          </button>
        </form>
      </div>
      {!googleDriveConnected && (
        <div class="alert mt-4 text-sm">
          <span>Connect Google Drive to upload generated documents automatically.</span>
          <a class="btn btn-outline btn-sm" href="/auth/google/start">
            Connect Google Drive
          </a>
        </div>
      )}
      {latest ? (
        <div class="mt-4 space-y-3">
          <div class="flex flex-wrap items-center gap-2 text-sm">
            <span class={`badge ${statusClass}`}>{latest.status}</span>
            <span class="text-base-content/60">Attempts: {latest.attempts}</span>
          </div>
          {latest.errorMessage && (
            <div class="alert alert-error text-sm">
              <span>{latest.errorMessage}</span>
            </div>
          )}
          {latest.artifacts.length > 0 && (
            <div class="flex flex-wrap gap-2">
              {latest.artifacts.map((artifact) => (
                <div class="join">
                  <a class="btn btn-outline btn-sm join-item" href={`/artifacts/${artifact.id}`}>
                    {artifact.type === 'job_context'
                      ? 'Job context JSON'
                      : artifact.type === 'resume'
                        ? 'Resume DOCX'
                        : 'Cover letter DOCX'}
                  </a>
                  {artifact.googleDriveUrl && (
                    <a
                      class="btn btn-outline btn-sm join-item"
                      href={artifact.googleDriveUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Drive
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
          {snapshot && <EvidenceReview snapshot={snapshot} runId={latest.id} />}
        </div>
      ) : (
        <p class="mt-4 text-sm text-base-content/60">No document generation has been queued yet.</p>
      )}
    </section>
  )
}

function parseEvidenceSnapshot(value: string | null): EvidenceSelectionSnapshot | null {
  if (!value) return null
  try {
    const parsed = evidenceSelectionSnapshotSchema.safeParse(JSON.parse(value))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function IdList({ ids }: { ids: string[] }) {
  return ids.length ? (
    <div class="flex flex-wrap gap-1">
      {ids.map((id) => (
        <span class="badge badge-outline badge-sm">{id}</span>
      ))}
    </div>
  ) : (
    <span class="text-base-content/60">None</span>
  )
}

function EvidenceReview({
  snapshot,
  runId,
}: {
  snapshot: EvidenceSelectionSnapshot
  runId: number
}) {
  const selection = snapshot.selection
  return (
    <details class="rounded-box border border-base-300 p-3 text-sm">
      <summary class="cursor-pointer font-semibold">Evidence selection & generation record</summary>
      <div class="mt-3 space-y-4">
        <div class="flex flex-wrap items-center gap-2">
          <span class="badge badge-neutral">Profile: {snapshot.profile.id}</span>
          <span class="badge badge-outline">Profile updated: {snapshot.profile.lastUpdated}</span>
          <span class="badge badge-outline">Prompt: {applicationGenerationPromptVersion}</span>
          <a class="btn btn-ghost btn-xs" href={`/generation-snapshots/${runId}`}>
            Download snapshot
          </a>
        </div>
        <div class="grid gap-3 md:grid-cols-2">
          <EvidenceGroup label="Experiences" ids={selection.experienceIds} />
          <EvidenceGroup label="Achievements" ids={selection.achievementIds} />
          <EvidenceGroup label="Projects" ids={selection.projectIds} />
          <EvidenceGroup
            label="Skills"
            ids={[...selection.preferredSkillIds, ...selection.matchedConditionalSkillIds]}
          />
          <EvidenceGroup label="Cover-letter stories" ids={selection.storyIds} />
          <EvidenceGroup label="Excluded for safety" ids={selection.excludedUnsafeAchievementIds} />
        </div>
        <div class="rounded-box bg-base-200 p-3 text-xs text-base-content/70">
          <strong>Review gap:</strong> evidence not listed here was not available to the generator.
          “Excluded for safety” items require a factual review before being enabled in career data.
        </div>
        <div class="text-xs text-base-content/60">
          Career-data schema versions — candidate {snapshot.sourceVersions.candidate}, experiences{' '}
          {snapshot.sourceVersions.experiences}, achievements {snapshot.sourceVersions.achievements}
          , projects {snapshot.sourceVersions.projects}, skills {snapshot.sourceVersions.skills},
          stories {snapshot.sourceVersions.stories}; profile {snapshot.sourceVersions.profile}.
        </div>
      </div>
    </details>
  )
}

function EvidenceGroup({ label, ids }: { label: string; ids: string[] }) {
  return (
    <div>
      <p class="mb-1 font-medium">{label}</p>
      <IdList ids={ids} />
    </div>
  )
}

function ContactsSection({ job, filters }: { job: JobCardData; filters: Filters }) {
  return (
    <section class="mt-8">
      <div class="divider">Contacts</div>
      {job.contacts?.length ? (
        <ul class="mb-4 space-y-2">
          {job.contacts.map((contact) => (
            <li class="rounded-box border border-base-300 p-3">
              <div class="font-medium">{contact.name}</div>
              <div class="flex flex-wrap gap-x-4 text-sm text-base-content/70">
                {contact.email && (
                  <a class="link" href={`mailto:${contact.email}`}>
                    {contact.email}
                  </a>
                )}
                {contact.linkedinUrl && (
                  <a class="link" href={contact.linkedinUrl} target="_blank" rel="noreferrer">
                    LinkedIn
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p class="mb-4 text-sm text-base-content/60">No contacts linked yet.</p>
      )}
      <form
        class="card bg-base-200"
        hx-post={`/applications/${job.id}/contacts?${query(filters)}`}
        hx-target="#drawer-content"
        hx-swap="innerHTML"
        novalidate
      >
        <div class="card-body grid gap-3 p-4 sm:grid-cols-3">
          <Field label="Name" name="name" required />
          <Field label="Email" name="email" type="email" />
          <Field label="LinkedIn URL" name="linkedinUrl" type="url" />
          <button class="btn btn-outline btn-sm sm:col-span-3">Add contact</button>
        </div>
      </form>
    </section>
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
          list="workspace-company-options"
        />
        <Field label="Location" name="location" value={job.location} />
        <label class="form-control">
          <span class="label-text mb-1">Direction</span>
          <select name="direction" class="select select-bordered">
            {profiles.map((profile) => (
              <option value={profile.id} selected={job.direction === profile.id}>
                {profile.label}
              </option>
            ))}
          </select>
        </label>
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
        <div class="sm:col-span-2">
          <Field
            label="Skills"
            name="skills"
            value={job.skills.join(', ')}
            list="workspace-skill-options"
          />
        </div>
        <label class="form-control sm:col-span-2">
          <span class="label-text mb-1">Notes</span>
          <textarea class="textarea textarea-bordered min-h-28" name="notes">
            {job.notes ?? ''}
          </textarea>
        </label>
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
      <button class="btn btn-primary w-full">🚀 Sent Application</button>
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
