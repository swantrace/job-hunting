import type { Filters } from '../../src/db/queries'
import { TextareaField } from './ui/FormField'

export function AiParser({ filters, oob = false }: { filters: Filters; oob?: boolean }) {
  return (
    <section
      id="ai-parser"
      class="card bg-base-100 shadow-sm"
      {...(oob ? { 'hx-swap-oob': 'outerHTML' } : {})}
    >
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
          <TextareaField
            name="description"
            label="Job description"
            placeholder="Paste the job description here..."
            maxLength={20000}
            rows={8}
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
