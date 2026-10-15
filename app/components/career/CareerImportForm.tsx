import { FileField } from '../ui/form-fields/FileField'

export const careerImportFormId = 'career-import-form'
export const careerImportResultId = 'career-import-result'

/**
 * Upload control for a career import source: either a `career-dataset` JSON
 * document, or a zip archive of the legacy career directory (documents,
 * `skill-taxonomy.json` and `base-resumes/`).
 *
 * The upload is only ever *read*. The response is a preview fragment; nothing is
 * written until the operator confirms the preview, and the preview is bound to
 * the source bytes and the database revision so a stale confirmation is refused.
 */
export function CareerImportForm({ message }: { message?: string }) {
  return (
    <form
      id={careerImportFormId}
      class="card border border-base-300 bg-base-100"
      hx-post="/career-data/transfer/import"
      hx-target={`#${careerImportResultId}`}
      hx-swap="innerHTML"
      hx-encoding="multipart/form-data"
      hx-disabled-elt="find button"
    >
      <div class="card-body gap-4">
        <h3 class="card-title text-base">Import a career dataset or legacy directory</h3>
        <p class="text-sm text-base-content/70">
          Upload a <code>career-dataset</code> JSON export, or a zip archive of the legacy
          <code> career-data</code> directory. The preview reports counts and conflicts and binds
          the source fingerprint and database revision; confirming re-validates both and refuses a
          stale preview. Nothing is written during the preview.
        </p>
        <FileField
          id="career-import-file"
          name="source"
          label="Career dataset JSON or legacy directory zip"
          accept="application/json,.json,.zip,application/zip"
          required
          help="Maximum 32 MB. Merge is by stable key; an import never deletes missing records."
          error={message}
        />
        <div class="card-actions justify-end">
          <button class="btn btn-primary">
            <span class="loading loading-spinner loading-sm htmx-indicator" /> Preview import
          </button>
        </div>
      </div>
    </form>
  )
}
