import type { ImportPreview as Preview } from '../../src/db/queries'

export function ImportPage() {
  return (
    <main class="mx-auto min-h-screen max-w-3xl space-y-5 p-4 lg:p-7">
      <a class="link text-sm" href="/">
        ← Dashboard
      </a>
      <div>
        <h1 class="text-3xl font-bold">Import JSON backup</h1>
        <p class="text-base-content/60">
          Preview changes first. Local-only records are never deleted.
        </p>
      </div>
      <form
        class="card bg-base-100 shadow-sm"
        hx-post="/import"
        hx-target="#import-result"
        hx-swap="innerHTML"
        hx-encoding="multipart/form-data"
      >
        <div class="card-body gap-4">
          <input
            class="file-input file-input-bordered w-full"
            type="file"
            name="backup"
            accept="application/json,.json"
            required
          />
          <button class="btn btn-primary">Preview import</button>
        </div>
      </form>
      <div id="import-result" />
    </main>
  )
}

export function ImportPreview({ preview, payload }: { preview: Preview; payload: string }) {
  return (
    <section class="card bg-base-100 shadow-sm">
      <div class="card-body">
        <h2 class="card-title">Merge preview</h2>
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
        {preview.conflicts.length > 0 && (
          <div class="alert alert-warning">
            <ul>
              {preview.conflicts.map((conflict) => (
                <li>{conflict}</li>
              ))}
            </ul>
          </div>
        )}
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
