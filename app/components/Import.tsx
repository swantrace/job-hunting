import type { ImportPreview as Preview } from '../../src/db/queries'
import { AppShell } from './layout/AppShell'
import { FileField } from './ui/FormField'
import { Icon } from './ui/Icon'

export function ImportPage() {
  return (
    <AppShell
      title="Backup & restore"
      currentPath="/import"
      actions={
        <a href="/export" class="btn btn-outline btn-sm" aria-label="Export JSON backup">
          <Icon name="download" />
          <span class="hidden sm:inline">Export backup</span>
        </a>
      }
    >
      <div class="mb-5 max-w-2xl">
        <h2 class="text-2xl font-bold">Restore from a backup</h2>
        <p class="mt-1 text-base-content/60">
          Preview changes before merging a Job Tracker JSON backup into this database.
        </p>
      </div>
      <form
        class="card max-w-2xl border border-base-300 bg-base-100"
        hx-post="/import"
        hx-target="#import-result"
        hx-swap="innerHTML"
        hx-encoding="multipart/form-data"
        hx-disabled-elt="find button"
      >
        <div class="card-body gap-4">
          <FileField name="backup" label="Backup file" accept="application/json,.json" required />
          <button class="btn btn-primary">
            <span class="loading loading-spinner loading-sm htmx-indicator" /> Preview import
          </button>
        </div>
      </form>
      <div id="import-result" />
    </AppShell>
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
