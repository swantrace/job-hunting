import { applicationGenerationPromptVersion } from '../../../src/ai/prompts/application-generation'
import { type GenerationRunWithArtifacts } from '../../../src/db/generation'
import type { Filters } from '../../../src/db/queries'
import {
  type EvidenceSelectionSnapshot,
  evidenceSelectionSnapshotSchema,
} from '../../../src/lib/evidence-selection'
import { query } from './helpers'

export function DocumentsPanel({
  jobId,
  filters,
  runs,
  evidenceSnapshot,
  googleDriveConnected,
  active = false,
}: {
  jobId: number
  filters: Filters
  runs: GenerationRunWithArtifacts[]
  evidenceSnapshot: string | null
  googleDriveConnected: boolean
  active?: boolean
}) {
  return (
    <div
      id="workspace-documents-panel"
      role="tabpanel"
      aria-labelledby="workspace-tab-documents"
      data-workspace-panel
      class={active ? '' : 'hidden'}
    >
      <GenerationPanel
        jobId={jobId}
        filters={filters}
        runs={runs}
        evidenceSnapshot={evidenceSnapshot}
        googleDriveConnected={googleDriveConnected}
      />
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
      class="rounded-box border border-base-300 p-4"
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
      {googleDriveConnected && (
        <div class="mt-4 flex items-center justify-between gap-3 rounded-box bg-base-200 p-3 text-sm">
          <span>Google Drive is connected.</span>
          <a class="btn btn-ghost btn-sm" href="/auth/google/start">
            Reconnect Drive
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
                <ArtifactActions artifact={artifact} />
              ))}
            </div>
          )}
          {snapshot && <EvidenceReview snapshot={snapshot} runId={latest.id} />}
        </div>
      ) : (
        <p class="text-sm text-base-content/60">No document generation has been queued yet.</p>
      )}
    </section>
  )
}

export function ArtifactActions({
  artifact,
}: {
  artifact: GenerationRunWithArtifacts['artifacts'][number]
}) {
  const label =
    artifact.type === 'job_context'
      ? 'Job context JSON'
      : artifact.type === 'resume'
        ? 'Resume DOCX'
        : 'Cover letter DOCX'
  return (
    <div id={`artifact-actions-${artifact.id}`} class="space-y-1">
      <div class="join">
        <a class="btn btn-outline btn-sm join-item" href={`/artifacts/${artifact.id}`}>
          {label}
        </a>
        {artifact.googleDriveUrl ? (
          <a
            class="btn btn-outline btn-sm join-item"
            href={artifact.googleDriveUrl}
            target="_blank"
            rel="noreferrer"
          >
            Drive
          </a>
        ) : (
          <button
            class="btn btn-outline btn-sm join-item"
            hx-post={`/artifacts/${artifact.id}/upload`}
            hx-target={`#artifact-actions-${artifact.id}`}
            hx-swap="outerHTML"
            hx-disabled-elt="this"
          >
            Retry upload
          </button>
        )}
      </div>
      {artifact.googleDriveError && (
        <p class="max-w-xs text-xs text-error">{artifact.googleDriveError}</p>
      )}
    </div>
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
