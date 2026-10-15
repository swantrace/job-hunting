import { InputField } from '../ui/form-fields/InputField'

/**
 * The explicit, default-off "Remember as alias" control.
 *
 * Remembering a global alias is a separate opt-in action and never implied by
 * mapping: this renders its own form so an accidental submit inside the mapping
 * form can never create an alias. The default value is the raw term, but the
 * user still has to submit this form on purpose.
 */
export function AliasRememberField({
  mentionId,
  term,
  action,
  disabled,
  aliasError,
}: {
  mentionId: number
  term: string
  action: string
  disabled?: boolean
  aliasError?: string
}) {
  return (
    <form
      id={`skill-mention-alias-${mentionId}`}
      class="mt-3 border-t border-base-300 pt-3"
      hx-post={action}
      hx-target="#skill-review-panel"
      hx-swap="outerHTML"
      hx-disabled-elt="find button"
      novalidate
    >
      <input type="hidden" name="mentionId" value={mentionId} />
      <input type="hidden" name="action" value="remember-alias" />
      <InputField
        id={`remember-alias-${mentionId}`}
        name="alias"
        label="Remember as alias"
        value={term}
        maxLength={160}
        placeholder="Exact wording the catalog should also answer to"
        help="Writes one global alias. Mapping never creates an alias by itself."
        error={aliasError}
        disabled={disabled}
      />
      <button type="submit" class="btn btn-ghost btn-sm mt-2" disabled={disabled}>
        Remember as alias
      </button>
    </form>
  )
}
