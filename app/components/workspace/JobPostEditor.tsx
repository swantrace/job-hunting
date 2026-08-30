import type { Filters, JobCardData } from '../../../src/db/queries'
import { query } from './helpers'

export function JobPostEditor({ job, filters }: { job: JobCardData; filters: Filters }) {
  const posting = job.jobPosting
  return (
    <div class="rounded-box border border-base-300 p-4">
      <h3 class="font-semibold">Saved job post</h3>
      {posting ? (
        <form
          hx-post={`/applications/${job.id}/job-post?${query(filters)}`}
          hx-target="#workspace-application-panel"
          hx-swap="outerHTML"
          hx-disabled-elt="find button"
        >
          <textarea
            name="rawText"
            class="textarea mt-2 w-full"
            rows={12}
            aria-label="Raw job post text"
          >
            {posting.rawText}
          </textarea>
          <div class="mt-2 flex items-center justify-between gap-2">
            <span class="text-xs text-base-content/60">
              Saving edits the raw post and updates its content hash before any rerun.
            </span>
            <button class="btn btn-sm">Save job post</button>
          </div>
        </form>
      ) : (
        <p class="mt-2 text-sm text-base-content/60">No job post saved yet.</p>
      )}
    </div>
  )
}
