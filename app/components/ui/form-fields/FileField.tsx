import { Fieldset } from './Fieldset'
import { describedByIds, resolveFieldId } from './helpers'
import type { FileFieldProps } from './types'

export function FileField({
  id,
  namespace,
  name,
  label,
  required,
  disabled,
  help,
  error,
  message,
  accept,
  multiple,
  labelAction,
}: FileFieldProps) {
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
      <input
        id={resolvedId}
        name={name}
        type="file"
        accept={accept}
        multiple={multiple}
        required={required}
        disabled={disabled}
        aria-invalid={errorText ? 'true' : undefined}
        aria-describedby={describedByIds(resolvedId, help, errorText)}
        class={`file-input w-full ${errorText ? 'file-input-error' : ''}`}
      />
    </Fieldset>
  )
}
