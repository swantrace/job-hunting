import type { Filters } from '../../src/db/queries'
import type { ParsedJob } from '../../src/lib/ai'
import { todayISO } from '../../src/lib/date'
import { QuickCollect } from './Dashboard'

export function AiParser({ filters }: { filters: Filters }) {
  return (
    <section class="card bg-base-100 shadow-sm">
      <div class="card-body p-5">
        <h2 class="card-title">AI job parser</h2>
        <p class="text-sm text-base-content/60">Paste a job post to create an editable draft.</p>
        <form hx-post="/ai/parse-job" hx-target="#ai-parser-result" hx-swap="innerHTML" novalidate>
          <textarea
            class="textarea textarea-bordered min-h-40 w-full"
            name="description"
            placeholder="Paste the job description here..."
            maxLength={20000}
            required
          />
          <button class="btn btn-secondary mt-3 w-full">Parse with AI</button>
        </form>
        <div id="ai-parser-result" class="mt-4" />
      </div>
    </section>
  )
}

export function ParsedJobDraft({
  parsed,
  filters,
  jobPostText,
}: {
  parsed: ParsedJob
  filters: Filters
  jobPostText: string
}) {
  return (
    <div class="space-y-3">
      <div class="alert alert-info text-sm">Review the AI draft before saving.</div>
      <QuickCollect
        filters={filters}
        formId="quick-form"
        oob
        values={{
          jobTitle: parsed.jobTitle,
          companyName: parsed.companyName,
          location: parsed.location ?? '',
          url: parsed.url ?? '',
          postedDate: parsed.postedDate ?? todayISO(),
          tags: parsed.tags.join(', '),
          salary: parsed.salary ?? '',
          applicationSource: parsed.applicationSource ?? '',
          jobPostText,
        }}
      />
    </div>
  )
}
