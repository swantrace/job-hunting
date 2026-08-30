import { ImportPreview } from './ImportPreview'
import { AppShell } from './layout/AppShell'
import { FileField } from './ui/FormField'
import { Icon } from './ui/Icon'

export function ImportPage() {
  return (
    <AppShell
      title="Backup & restore"
      currentPath="/import"
      actions={
        <a href="/export" class="btn btn-outline btn-sm" aria-label="Export portable data">
          <Icon name="download" />
          <span class="hidden sm:inline">Export data</span>
        </a>
      }
    >
      <div class="mb-5 max-w-2xl">
        <h2 class="text-2xl font-bold">Restore portable data</h2>
        <p class="mt-1 text-base-content/60">
          Preview before merging a portable JSON export (core companies, contacts, applications,
          skills, activities, and Job Post text). This is not a full SQLite/artifact backup: derived
          AI history, generated documents, and Google Drive settings are excluded and reset on
          import.
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
