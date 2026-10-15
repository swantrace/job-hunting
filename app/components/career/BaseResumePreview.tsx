import type { CareerBaseResume } from '../../../src/db/schema'

/**
 * Read-only preview of one immutable Base Resume version, including its content
 * hash and approval state. Editing always starts a new draft instead.
 */
export function BaseResumePreview({
  version,
  directionLabel,
}: {
  version: CareerBaseResume
  directionLabel: string
}) {
  return (
    <section
      id="career-base-resumes-preview"
      aria-labelledby="career-base-resumes-preview-heading"
      class="card border border-base-300 bg-base-100"
    >
      <div class="card-body gap-3 p-4">
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 id="career-base-resumes-preview-heading" class="text-lg font-semibold">
              {directionLabel} — version {version.version}
            </h2>
            <p class="text-sm text-base-content/60">Read-only. Versions are immutable.</p>
          </div>
          <div class="flex flex-wrap items-center gap-1">
            <span class="badge badge-outline badge-sm whitespace-nowrap">{version.status}</span>
            {version.approvedAt ? (
              <span class="badge badge-ghost badge-sm whitespace-nowrap">
                approved {version.approvedAt}
              </span>
            ) : null}
            <code class="text-xs text-base-content/60" title={version.contentHash}>
              {version.contentHash}
            </code>
          </div>
        </div>

        <pre class="max-h-[32rem] overflow-auto rounded-box bg-base-200 p-3 whitespace-pre-wrap text-xs leading-relaxed">
          {version.markdown}
        </pre>

        <div class="flex flex-wrap justify-end gap-2 pt-2">
          <button
            class="btn btn-ghost"
            hx-get="/career-data/base-resumes"
            hx-target="#career-data-section"
            hx-swap="outerHTML"
          >
            Close preview
          </button>
          <button
            class="btn btn-primary"
            hx-get={`/career-data/base-resumes/form?direction=${encodeURIComponent(version.directionKey)}&from=${version.id}`}
            hx-target="#career-base-resumes-editor"
            hx-swap="innerHTML"
          >
            New draft from this
          </button>
        </div>
      </div>
    </section>
  )
}
