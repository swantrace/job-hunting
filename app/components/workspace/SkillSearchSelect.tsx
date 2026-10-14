import type { CatalogSearchResult } from '../../../src/db/skill-mapping-service'
import { Fieldset } from '../ui/form-fields/Fieldset'

/**
 * The native catalog `<select>` fed by the server search fragment.
 *
 * A native select is the accessible choice here: it is keyboard operable,
 * announces its options, and needs no script. Options are never taken from the
 * whole catalog — the initial suggestions and every later list come from the
 * bounded `searchApprovedCatalog` result.
 *
 * The `<option>` list must live *inside* the select: browser parsers ignore
 * `<option>` elements swapped into a plain container, so the search fragment
 * returns this element itself (`hx-swap="outerHTML"`), not a detached list.
 */
export function SkillCatalogSelect({
  mentionId,
  rawTerm,
  results,
  disabled,
}: {
  mentionId: number
  rawTerm: string
  results: CatalogSearchResult[]
  disabled?: boolean
}) {
  return (
    <select
      id={`mention-skill-select-${mentionId}`}
      name="skillId"
      class="select w-full mt-2"
      disabled={disabled}
      aria-label={`Catalog skill for ${rawTerm}`}
    >
      <option value="">No catalog skill selected</option>
      <option value={`create:${rawTerm}`}>Create new skill…</option>
      {results.length === 0 ? (
        <option value="" disabled>
          No approved catalog skill matches — choose Create new skill…
        </option>
      ) : (
        results.map((result) => (
          <option value={String(result.id)}>
            {result.name}
            {result.category ? ` · ${result.category}` : ''}
          </option>
        ))
      )}
    </select>
  )
}

/**
 * The searchable half of the selector: a debounced server search that swaps the
 * bounded option list in {@link SkillCatalogSelect}.
 *
 * The blank option is a first-class state: blank selection is never Skip, so the
 * route rejects it with a 422 instead of guessing.
 */
export function SkillSearchSelect({
  mentionId,
  rawTerm,
  searchUrl,
  suggestions,
  error,
  disabled,
}: {
  mentionId: number
  rawTerm: string
  searchUrl: string
  suggestions: CatalogSearchResult[]
  error?: string
  disabled?: boolean
}) {
  return (
    <Fieldset
      id={`mention-skill-${mentionId}`}
      label={`Catalog skill for “${rawTerm}”`}
      help="Search the approved catalog, or choose Create new skill… To leave this term unresolved, use Skip — a blank selection is not a decision."
      error={error}
    >
      <input
        id={`skill-search-${mentionId}`}
        name="q"
        type="search"
        class="input w-full"
        placeholder="Search approved skills"
        aria-label={`Search the approved skill catalog for ${rawTerm}`}
        aria-controls={`mention-skill-select-${mentionId}`}
        disabled={disabled}
        hx-get={searchUrl}
        hx-trigger="input changed delay:200ms, search"
        hx-target={`#mention-skill-select-${mentionId}`}
        hx-swap="outerHTML"
        hx-indicator={`#skill-search-loading-${mentionId}`}
      />
      <span
        id={`skill-search-loading-${mentionId}`}
        class="loading loading-spinner loading-xs htmx-indicator"
        aria-hidden="true"
      />
      <SkillCatalogSelect
        mentionId={mentionId}
        rawTerm={rawTerm}
        results={suggestions}
        disabled={disabled}
      />
    </Fieldset>
  )
}
