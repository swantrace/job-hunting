import { applicationGenerationPromptVersion } from '../../../src/ai/prompts/application-generation'
import type { GenerationRunWithArtifacts } from '../../../src/db/generation'
import type { Filters } from '../../../src/db/queries'
import {
  type EvidenceSelectionSnapshot,
  evidenceSelectionSnapshotSchema,
} from '../../../src/lib/evidence-selection'
import { ArtifactActions } from './ArtifactActions'
import { query } from './helpers'

export function GenerationPanel({
  jobId,
  filters,
  runs,
  evidenceSnapshot,
  googleDriveConnected,
  generationReady = true,
}: {
  jobId: number
  filters: Filters
  runs: GenerationRunWithArtifacts[]
  evidenceSnapshot: string | null
  googleDriveConnected: boolean
  generationReady?: boolean
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
          <button class="btn btn-secondary btn-sm" disabled={!generationReady}>
            <span class="loading loading-spinner loading-xs htmx-indicator" />
            {latest?.status === 'Failed' ? 'Retry generation' : 'Generate documents'}
          </button>
        </form>
      </div>
      {!generationReady ? (
        <div class="alert alert-warning mt-4 text-sm" role="alert">
          <span>
            Generation is disabled until every “not in career data” skill is skipped or included.
            Review skills first.
          </span>
        </div>
      ) : null}
      {!googleDriveConnected ? (
        <div class="alert mt-4 text-sm">
          <span>Connect Google Drive to upload generated documents automatically.</span>
          <a class="btn btn-outline btn-sm" href="/auth/google/start">
            Connect Google Drive
          </a>
        </div>
      ) : (
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
          {latest.errorMessage ? (
            <div class="alert alert-error text-sm">
              <span>{latest.errorMessage}</span>
            </div>
          ) : null}
          {latest.artifacts.length ? (
            <div class="flex flex-wrap gap-2">
              {latest.artifacts.map((artifact) => (
                <ArtifactActions artifact={artifact} />
              ))}
            </div>
          ) : null}
          {snapshot ? <EvidenceReview snapshot={snapshot} runId={latest.id} /> : null}
        </div>
      ) : (
        <p class="text-sm text-base-content/60">No document generation has been queued yet.</p>
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
