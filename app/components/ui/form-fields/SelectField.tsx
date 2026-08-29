import { Fieldset } from './Fieldset'
import { describedByIds, resolveFieldId } from './helpers'
import type { SelectFieldProps } from './types'

export function SelectField({
  id,
  namespace,
  name,
  label,
  required,
  disabled,
  multiple,
  help,
  error,
  message,
  labelAction,
  children,
}: SelectFieldProps) {
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
      <select
        id={resolvedId}
        name={name}
        multiple={multiple}
        required={required}
        disabled={disabled}
        aria-invalid={errorText ? 'true' : undefined}
        aria-describedby={describedByIds(resolvedId, help, errorText)}
        class={`select w-full ${errorText ? 'select-error' : ''}`}
      >
        {children}
      </select>
    </Fieldset>
  )
}
