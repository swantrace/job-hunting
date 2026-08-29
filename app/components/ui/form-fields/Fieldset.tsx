import type { Child } from 'hono/jsx'
import { FieldError } from './FieldError'
import { FieldHelp } from './FieldHelp'

export function Fieldset({
  id,
  label,
  required,
  help,
  error,
  labelAction,
  children,
}: {
  id: string
  label: string
  required?: boolean
  help?: string
  error?: string
  labelAction?: Child
  children: Child
}) {
  return (
    <fieldset class="fieldset">
      <legend class="fieldset-legend flex w-full items-center justify-between gap-2">
        <span>
          {label}
          {required ? (
            <span class="ms-1 text-error" aria-hidden="true">
              *
            </span>
          ) : null}
        </span>
        {labelAction}
      </legend>
      {children}
      {help ? <FieldHelp id={`${id}-help`}>{help}</FieldHelp> : null}
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
    </fieldset>
  )
}
