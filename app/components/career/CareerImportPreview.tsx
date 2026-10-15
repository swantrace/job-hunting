import type { CareerImportPreview } from '../../../src/lib/career-import'

export const careerImportPreviewId = 'career-import-preview'

function countRows(preview: CareerImportPreview) {
  return Object.entries(preview.report.byKind)
    .map(([kind, counts]) => ({ kind, ...counts }))
    .sort((left, right) => left.kind.localeCompare(right.kind))
}

/**
 * Preview of an uploaded career source. It reports counts, conflicts, the source
 * fingerprint and the database revision — never personal content, a file path or
 * any text from the upload. Confirming re-reads the same bytes server-side and
 * re-checks the database revision, so a preview that has gone stale is refused
 * instead of applied.
 */
export function CareerImportPreviewPanel({
  preview,
  payload,
  message,
}: {
  preview: CareerImportPreview
  /** Base64 of the exact uploaded bytes, re-read and hash-checked on confirm. */
  payload: string
  message?: string
}) {
  const rows = countRows(preview)
  const blocked = preview.conflicts.length > 0
  return (
    <section id={careerImportPreviewId} class="card border border-base-300 bg-base-100">
      <div class="card-body gap-4">
        <h3 class="card-title text-base">Import preview</h3>
        {message ? <div class="alert alert-error">{message}</div> : null}
        <dl class="grid gap-3 sm:grid-cols-2">
          <div>
            <dt class="text-xs font-semibold uppercase tracking-wider text-base-content/50">
              Source fingerprint
            </dt>
            <dd class="font-mono text-sm break-all">{preview.sourceHash}</dd>
          </div>
          <div>
            <dt class="text-xs font-semibold uppercase tracking-wider text-base-content/50">
              Database revision
            </dt>
            <dd class="text-sm">{preview.databaseRevision}</dd>
          </div>
        </dl>
        <div class="overflow-x-auto">
          <table class="table table-sm">
            <caption class="text-left text-sm text-base-content/70">
              Planned changes. Nothing has been written yet.
            </caption>
            <thead>
              <tr>
                <th scope="col">Kind</th>
                <th scope="col">New</th>
                <th scope="col">Updated</th>
                <th scope="col">Unchanged</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colspan={4} class="text-base-content/60">
                    No changes planned.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr>
                    <th scope="row">{row.kind}</th>
                    <td>{row.inserted}</td>
                    <td>{row.updated}</td>
                    <td>{row.unchanged}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                <td>{preview.report.inserted}</td>
                <td>{preview.report.updated}</td>
                <td>{preview.report.unchanged}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {blocked ? (
          <div class="alert alert-warning" role="alert">
            <div>
              <h4 class="font-semibold">
                {preview.conflicts.length} conflict(s) block this import
              </h4>
              <ul class="mt-1 list-disc ps-5 text-sm">
                {preview.conflicts.map((conflict) => (
                  <li>{conflict}</li>
                ))}
              </ul>
              <p class="mt-1 text-sm">Nothing was written. Fix the source and preview it again.</p>
            </div>
          </div>
        ) : null}
        <form
          hx-post="/career-data/transfer/import/confirm"
          hx-target={`#${careerImportPreviewId}`}
          hx-swap="outerHTML"
          hx-disabled-elt="find button"
        >
          <input type="hidden" name="sourceHash" value={preview.sourceHash} />
          <input type="hidden" name="payload" value={payload} />
          <div class="card-actions items-center justify-end">
            <p class="text-sm text-base-content/60">
              Confirm writes every change in one transaction.
            </p>
            <button class="btn btn-primary" disabled={blocked}>
              <span class="loading loading-spinner loading-sm htmx-indicator" /> Confirm import
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}
