import type { GenerationRunWithArtifacts } from '../../../src/db/generation'

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
      {artifact.googleDriveError ? (
        <p class="max-w-xs text-xs text-error">{artifact.googleDriveError}</p>
      ) : null}
    </div>
  )
}
