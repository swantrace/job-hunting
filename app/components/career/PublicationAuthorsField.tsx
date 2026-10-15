import type { PublicationAuthorFormValues } from '../../../src/lib/career/form-input'
import { InputField } from '../ui/FormField'

/**
 * The stable root of the ordered author editor. A reorder round trip replaces
 * exactly this element, so the rest of the open form (including unsaved edits)
 * is never re-rendered.
 */
export const publicationAuthorsRootId = 'career-publications-authors'

/**
 * Ordered authors with a per-row candidate toggle. Order is the visible row
 * order: each `authorName` input is one author and each checked `authorCandidate`
 * carries the row index, so the server can pair names with authorship without
 * any client script. The move buttons re-render only this field through the
 * stateless reorder endpoint, which keeps the toggle and unsaved names intact.
 */
export function PublicationAuthorsField({
  authors,
  error,
  oob = false,
}: {
  authors: PublicationAuthorFormValues[]
  error?: string
  oob?: boolean
}) {
  // One empty row is always offered so a new author can be added without script.
  const rows: PublicationAuthorFormValues[] = [...authors, { name: '', isCandidate: false }]
  const lastFilled = authors.length - 1
  const move = (index: number, action: 'up' | 'down', disabled: boolean) => (
    <button
      type="button"
      class="btn btn-ghost btn-xs"
      disabled={disabled}
      hx-post="/career-data/publications/authors/order"
      hx-vals={JSON.stringify({ action, index: String(index) })}
      hx-include="closest form"
      hx-target={`#${publicationAuthorsRootId}`}
      hx-swap="outerHTML"
      aria-label={`Move author ${index + 1} ${action}`}
    >
      {action === 'up' ? 'Move up' : 'Move down'}
    </button>
  )
  return (
    <fieldset
      id={publicationAuthorsRootId}
      class="fieldset"
      {...(oob ? { 'hx-swap-oob': 'outerHTML' } : {})}
    >
      <legend class="fieldset-legend">Authors</legend>
      <p class="label">
        Stored in the order shown. Clear a name to remove that author, or leave the last row blank
        and type to add one. Mark exactly one author as the candidate.
      </p>
      <div class="space-y-2">
        {rows.map((author, index) => {
          const filled = author.name.trim() !== ''
          return (
            <div class="flex flex-wrap items-end gap-2 rounded-box border border-base-300 p-2">
              <div class="min-w-56 flex-1">
                <InputField
                  id={`career-publications-author-${index}`}
                  name="authorName"
                  label={`Author ${index + 1}`}
                  value={author.name}
                />
              </div>
              <label class="flex cursor-pointer items-center gap-2 pb-2">
                <input
                  id={`career-publications-author-candidate-${index}`}
                  type="checkbox"
                  name="authorCandidate"
                  value={String(index)}
                  checked={author.isCandidate}
                  class="checkbox checkbox-sm"
                />
                <span class="text-sm">Candidate</span>
              </label>
              {filled ? (
                <div class="flex items-center gap-1 pb-2">
                  {move(index, 'up', index === 0)}
                  {move(index, 'down', index === lastFilled)}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
      {error ? (
        <p id={`${publicationAuthorsRootId}-error`} role="alert" class="text-error text-sm">
          {error}
        </p>
      ) : null}
    </fieldset>
  )
}
