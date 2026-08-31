import { applicationGenerationPromptVersion } from '../../../src/ai/prompts/application-generation'
import {
  type GenerationRunWithArtifacts,
  type GenerationState,
  getGenerationRunResults,
} from '../../../src/db/generation'
import type { Filters } from '../../../src/db/queries'
import type { ApplicationReadiness } from '../../../src/lib/application-readiness'
import {
  type EvidenceSelectionSnapshot,
  evidenceSelectionSnapshotSchema,
} from '../../../src/lib/evidence-selection'
import { ArtifactActions } from './ArtifactActions'
import { DraftReview } from './DraftReview'
import { query } from './helpers'

function generationCopy(state?: GenerationState) {
  switch (state?.state) {
    case 'current':
      return {
        heading: 'Documents current',
        message: 'Generated documents match the current review.',
        actionLabel: 'Regenerate documents',
      }
    case 'stale':
      return {
        heading: 'Outdated documents',
        message: 'Generated documents are outdated because upstream inputs changed.',
        actionLabel: 'Generate updated documents',
      }
    case 'legacy':
      return {
        heading: 'Legacy documents',
        message: 'These documents predate the current generation workflow.',
        actionLabel: 'Generate updated documents',
      }
    case 'failed':
      return {
        heading: 'Generation failed',
        message: 'The latest attempt failed; a previous result may still be usable.',
        actionLabel: 'Retry generation',
      }
    case 'queued':
      return { heading: 'Queued', message: 'Document generation is queued.', actionLabel: '' }
    case 'processing':
      return { heading: 'Generating', message: 'Document generation is running.', actionLabel: '' }
    default:
      return {
        heading: 'Not generated',
        message: 'Generate tailored documents once the review is ready.',
        actionLabel: 'Generate documents',
      }
  }
}

export function GenerationPanel({
  jobId,
  filters,
  runs,
  evidenceSnapshot,
  googleDriveConnected,
  readiness = { ready: true, reasons: [] },
  state,
}: {
  jobId: number
  filters: Filters
  runs: GenerationRunWithArtifacts[]
  evidenceSnapshot: string | null
  googleDriveConnected: boolean
  readiness?: ApplicationReadiness
  state?: GenerationState
}) {
  const latest = runs[0]
  const usableCompleted = state?.latestCompleted
    ? (runs.find((run) => run.id === state.latestCompleted?.id) ?? null)
    : null
  const copy = generationCopy(state)
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
  const results = usableCompleted ? getGenerationRunResults(usableCompleted.id) : null
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
          <h3 class="font-semibold">{copy.heading}</h3>
          <p class="text-sm text-base-content/60">{copy.message}</p>
          {state?.reasons.length ? (
            <p class="mt-1 text-xs text-base-content/60">Reasons: {state.reasons.join(', ')}</p>
          ) : null}
        </div>
        <form
          hx-post={`/applications/${jobId}/generation-runs?${query(filters)}`}
          hx-target="#generation-panel"
          hx-swap="outerHTML"
          hx-disabled-elt="find button"
        >
          <button class="btn btn-secondary btn-sm" disabled={!readiness.ready || shouldPoll}>
            {shouldPoll ? <span class="loading loading-spinner loading-xs" /> : null}
            {copy.actionLabel}
          </button>
        </form>
      </div>
      {!readiness.ready ? (
        <div class="alert alert-warning mt-4 text-sm" role="alert">
          <ul class="list-inside list-disc space-y-1">
            {readiness.reasons.map((reason) => (
              <li>{reason}</li>
            ))}
          </ul>
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
          <span class="flex items-center gap-2">
            <span class="badge badge-success">Connected</span>
            <span>Google Drive is connected.</span>
          </span>
        </div>
      )}
      {latest && latest.id !== usableCompleted?.id ? (
        <div class="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span class="text-base-content/60">Latest attempt:</span>
          <span class={`badge ${statusClass}`}>{latest.status}</span>
          {latest.errorMessage ? <span class="text-error">{latest.errorMessage}</span> : null}
        </div>
      ) : null}
      {usableCompleted ? (
        <div class="mt-4 space-y-3">
          <div class="flex flex-wrap items-center gap-2 text-sm">
            <span class="badge badge-success">Completed</span>
            <span class="text-base-content/60">Attempts: {usableCompleted.attempts}</span>
            {usableCompleted.completedAt ? (
              <span class="text-base-content/60">Date: {usableCompleted.completedAt}</span>
            ) : null}
          </div>
          {usableCompleted.artifacts.length ? (
            <div class="flex flex-wrap gap-2">
              {usableCompleted.artifacts.map((artifact) => (
                <ArtifactActions artifact={artifact} />
              ))}
            </div>
          ) : null}
          <DraftReview
            resumeMarkdown={results?.resumeMarkdown ?? null}
            coverLetterMarkdown={results?.coverLetterMarkdown ?? null}
            draftValidationJson={results?.draftValidationJson ?? null}
          />
          {snapshot ? <EvidenceReview snapshot={snapshot} runId={usableCompleted.id} /> : null}
        </div>
      ) : latest ? (
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
        </div>
      ) : (
        <p class="text-sm text-base-content/60">No document generation has been queued yet.</p>
      )}
      {runs.length ? (
        <details class="mt-4 text-sm">
          <summary class="cursor-pointer font-semibold">Generation history ({runs.length})</summary>
          <ul class="mt-2 list-inside space-y-1 text-xs text-base-content/70">
            {runs.map((run) => (
              <li class="flex flex-wrap items-center gap-2">
                <span class="font-mono">#{run.id}</span>
                <span class={`badge badge-sm ${statusClass}`}>{run.status}</span>
                {(run.completedAt ?? run.createdAt) ? (
                  <span>{run.completedAt ?? run.createdAt}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
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
