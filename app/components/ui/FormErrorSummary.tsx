import type { FieldErrors } from '../../../src/lib/validation'

/**
 * Focusable summary of server validation errors for long forms. Each entry links
 * to the control that owns the error using the control's stable ID (which the
 * form primitives derive from the field name unless an explicit ID is supplied).
 */
export function FormErrorSummary({
  errors,
  title = 'Please fix the highlighted fields:',
}: {
  errors: FieldErrors
  title?: string
}) {
  const items = Object.entries(errors).flatMap(([field, messages]) =>
    (messages ?? []).map((message) => ({ field, message })),
  )
  if (!items.length) return null
  return (
    <div class="alert alert-error" role="alert" tabindex={-1} data-error-summary>
      <div>
        <h2 class="font-semibold">{title}</h2>
        <ul class="list-disc ps-5 text-sm">
          {items.map(({ field, message }) => (
            <li>
              <a class="link" href={`#${field}`}>
                {message}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
