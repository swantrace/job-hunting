export function BatchAnalysisControls() {
  return (
    <form
      id="batch-analysis-form"
      class="mb-3 flex flex-wrap items-center gap-3 rounded-box border border-base-300 bg-base-100 p-3"
      hx-post="/applications/batch-analysis"
      hx-include="#board [data-application-selection]:checked"
      hx-target="#batch-analysis-status"
      hx-swap="outerHTML"
      hx-disabled-elt="find button, find select"
      hx-confirm="Run AI analysis for the selected applications? This uses your API credits. Existing results are kept as history. Documents will not be generated."
    >
      <label class="label cursor-pointer gap-2">
        <input
          type="checkbox"
          class="checkbox checkbox-sm"
          data-select-all-applications
          aria-label="Select all filtered applications"
        />
        Select all
      </label>
      <span class="text-sm" data-application-selection-count aria-live="polite">
        0 selected
      </span>
      <label class="label gap-2">
        <span class="sr-only">Batch analysis mode</span>
        <select
          name="mode"
          class="select select-sm w-full sm:w-auto"
          aria-label="Batch analysis mode"
        >
          <option value="candidate-only">Candidate analysis only</option>
          <option value="job-and-candidate">Job Post + Candidate analysis</option>
        </select>
      </label>
      <button type="submit" class="btn btn-primary btn-sm" data-run-batch-analysis disabled>
        <span class="loading loading-spinner loading-xs htmx-indicator" />
        Analyze selected
      </button>
      <button type="button" class="btn btn-ghost btn-sm" data-clear-application-selection>
        Clear selection
      </button>
      <p class="w-full text-xs text-base-content/60">
        Select up to 200 applications. Changing filters clears the selection. Documents are
        generated separately after your review.
      </p>
    </form>
  )
}
