import type { Filters } from '../../src/db/queries'
import type { ParsedJobResult } from '../../src/lib/ai'
import { todayISO } from '../../src/lib/date'
import { QuickCollect } from './Dashboard'

export function AiParser({ filters }: { filters: Filters }) {
  return (
    <section class="card bg-base-100 shadow-sm">
      <div class="card-body p-5">
        <h2 class="card-title">AI job parser</h2>
        <p class="text-sm text-base-content/60">Paste a job post to create an editable draft.</p>
        <form
          hx-post="/ai/parse-job"
          hx-target="#ai-parser-result"
          hx-swap="innerHTML"
          hx-disabled-elt="find button"
          novalidate
        >
          <textarea
            class="textarea textarea-bordered min-h-40 w-full"
            name="description"
            placeholder="Paste the job description here..."
            maxLength={20000}
            required
          />
          <button class="btn btn-secondary mt-3 w-full">
            <span class="loading loading-spinner loading-sm htmx-indicator" />
            Parse with AI
          </button>
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
  parsed: ParsedJobResult
  filters: Filters
  jobPostText: string
}) {
  return (
    <div class="space-y-3">
      <div class="alert alert-info text-sm">
        Review the AI draft, then add Company, Job URL, Application source, and Direction before
        saving.
      </div>
      <QuickCollect
        filters={filters}
        formId="quick-form"
        oob
        values={{
          jobTitle: parsed.jobTitle,
          location: parsed.location ?? '',
          postedDate: parsed.postedDate ?? todayISO(),
          skills: parsed.skills.join(', '),
          salary: parsed.salary ?? '',
          analysisRequirements: parsed.requirements.join('\n'),
          analysisResponsibilities: parsed.responsibilities.join('\n'),
          analysisPainPoints: parsed.painPoints.join('\n'),
          analysisCulture: parsed.culture.join('\n'),
          analysisRedFlags: parsed.redFlags.join('\n'),
          analysisSuccessMetrics: parsed.successMetrics.join('\n'),
          analysisBenefits: parsed.benefits.join('\n'),
          analysisNotes: parsed.notes ?? '',
          parserModel: parsed.parserModel,
          parserPromptVersion: parsed.parserPromptVersion,
          jobPostText,
        }}
      />
    </div>
  )
}
