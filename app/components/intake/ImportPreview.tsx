import type { ImportPreview as Preview } from '../../../src/db/queries'

export function ImportPreview({ preview, payload }: { preview: Preview; payload: string }) {
  return (
    <section class="card bg-base-100 shadow-sm">
      <div class="card-body">
        <h2 class="card-title">Merge preview</h2>
        <p class="text-sm text-base-content/70">
          Missing skills are kept. Explicit merges and deletions cannot be undone. Existing target
          review decisions take priority. Historical snapshots and documents are not rewritten.
        </p>
        <div class="overflow-x-auto">
          <table class="table table-zebra">
            <thead>
              <tr>
                <th>Type</th>
                <th>New</th>
                <th>Updated</th>
                <th>Unchanged</th>
                <th>Conflicts</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(preview.summary).map(([name, summary]) => (
                <tr>
                  <th>{name}</th>
                  <td>{summary.created}</td>
                  <td>{summary.updated}</td>
                  <td>{summary.unchanged}</td>
                  <td>{summary.conflicts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {preview.skillChanges?.length > 0 && (
          <ul class="space-y-2 text-sm" aria-label="Skill changes">
            {preview.skillChanges.map((change) => (
              <li>
                <strong>{change.key}</strong>: {change.action}
                {change.addedAliases.length > 0 && (
                  <span> · Add aliases: {change.addedAliases.join(', ')}</span>
                )}
                {change.removedAliases.length > 0 && (
                  <span> · Remove aliases: {change.removedAliases.join(', ')}</span>
                )}
              </li>
            ))}
          </ul>
        )}
        {preview.notices?.map((notice) => (
          <p class="text-sm text-base-content/70">{notice}</p>
        ))}
        {preview.conflicts.length > 0 ? (
          <div class="alert alert-warning">
            <ul>
              {preview.conflicts.map((conflict) => (
                <li>{conflict}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <form hx-post="/import/confirm" hx-target="#import-result" hx-swap="innerHTML">
          <textarea name="payload" class="hidden">
            {payload}
          </textarea>
          <button class="btn btn-primary" disabled={preview.conflicts.length > 0}>
            Confirm merge
          </button>
        </form>
      </div>
    </section>
  )
}
