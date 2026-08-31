import type { ApplicationAnalysisRun } from '../../../src/db/analysis'
import type { Filters } from '../../../src/db/queries'
import type {
  ResumeStrategyContent,
  ResumeStrategy as ResumeStrategyRecord,
} from '../../../src/db/resume-strategy'
import { query } from './helpers'

function EvidenceCheckboxes({
  name,
  allowlist,
  selected,
}: {
  name: string
  allowlist: string[]
  selected: string[]
}) {
  const selectedSet = new Set(selected)
  if (!allowlist.length)
    return <p class="text-sm text-base-content/60">No selected evidence is available yet.</p>
  return (
    <div class="flex flex-wrap gap-3">
      {allowlist.map((id) => (
        <label class="label cursor-pointer gap-2">
          <input
            type="checkbox"
            name={name}
            value={id}
            class="checkbox checkbox-sm"
            checked={selectedSet.has(id)}
          />
          <span class="font-mono text-xs">{id}</span>
        </label>
      ))}
    </div>
  )
}

export function ResumeStrategy({
  jobId,
  filters,
  run,
  strategy,
  draft,
  allowlist,
  canEdit,
  error,
  oob = false,
}: {
  jobId: number
  filters: Filters
  run: ApplicationAnalysisRun | null
  strategy: ResumeStrategyRecord | null
  draft: ResumeStrategyContent | null
  allowlist: string[]
  canEdit: boolean
  error?: string
  oob?: boolean
}) {
  const value = strategy ?? draft
  return (
    <section
      id="resume-strategy"
      class="rounded-box border border-base-300 p-4"
      aria-live="polite"
      {...(oob ? { 'hx-swap-oob': 'outerHTML' } : {})}
    >
      <h3 class="font-semibold">Resume strategy</h3>
      <p class="mt-1 text-sm text-base-content/60">
        Controls what the generated documents emphasize — not the factual truth of your career data.
      </p>
      {!canEdit ? (
        <p class="mt-3 text-sm text-base-content/60">
          Complete the current review and confirm a generation profile to edit the resume strategy.
        </p>
      ) : value ? (
        <form
          class="mt-4 space-y-4"
          hx-post={`/applications/${jobId}/resume-strategy?${query(filters)}`}
          hx-target="#resume-strategy"
          hx-swap="outerHTML"
          hx-disabled-elt="find button"
        >
          <input type="hidden" name="runId" value={run?.id ?? ''} />
          <fieldset class="fieldset">
            <legend class="fieldset-legend">
              Positioning <span class="text-error">*</span>
            </legend>
            <textarea
              name="positioning"
              rows={2}
              class={`textarea w-full ${error ? 'textarea-error' : ''}`}
              required
            >
              {value.positioning}
            </textarea>
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Primary themes (1–3, one per line)</legend>
            <textarea name="primaryThemes" rows={3} class="textarea w-full">
              {value.primaryThemes.join('\n')}
            </textarea>
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Emphasized evidence</legend>
            <EvidenceCheckboxes
              name="emphasizeEvidenceIds"
              allowlist={allowlist}
              selected={value.emphasizeEvidenceIds}
            />
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">De-emphasized evidence</legend>
            <EvidenceCheckboxes
              name="deemphasizeEvidenceIds"
              allowlist={allowlist}
              selected={value.deemphasizeEvidenceIds}
            />
          </fieldset>
          {error ? (
            <p role="alert" class="alert alert-error text-sm">
              {error}
            </p>
          ) : null}
          <div class="flex justify-end gap-2">
            <button class="btn btn-primary">Save strategy</button>
          </div>
        </form>
      ) : (
        <p class="mt-3 text-sm text-base-content/60">No strategy draft is available yet.</p>
      )}
    </section>
  )
}
