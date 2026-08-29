import { Fieldset } from './Fieldset'
import { describedByIds, resolveFieldId } from './helpers'
import type { TextareaFieldProps } from './types'

export function TextareaField({
  id,
  namespace,
  name,
  label,
  value,
  required,
  disabled,
  placeholder,
  help,
  error,
  message,
  rows,
  maxLength,
  labelAction,
}: TextareaFieldProps) {
  const resolvedId = resolveFieldId(id, namespace, name)
  const errorText = error ?? message
  return (
    <Fieldset
      id={resolvedId}
      label={label}
      required={required}
      help={help}
      error={errorText}
      labelAction={labelAction}
    >
      <textarea
        id={resolvedId}
        name={name}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        aria-invalid={errorText ? 'true' : undefined}
        aria-describedby={describedByIds(resolvedId, help, errorText)}
        class={`textarea w-full ${errorText ? 'textarea-error' : ''}`}
      >
        {value ?? ''}
      </textarea>
    </Fieldset>
  )
}
