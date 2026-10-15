import { Fieldset } from './Fieldset'
import { describedByIds, resolveFieldId } from './helpers'
import type { CheckboxFieldProps } from './types'

export function CheckboxField({
  id,
  namespace,
  name,
  label,
  checked,
  disabled,
  help,
  error,
  message,
  labelAction,
}: CheckboxFieldProps) {
  const resolvedId = resolveFieldId(id, namespace, name)
  const errorText = error ?? message
  return (
    <Fieldset id={resolvedId} label={label} help={help} error={errorText} labelAction={labelAction}>
      <input
        id={resolvedId}
        name={name}
        type="checkbox"
        value="on"
        checked={checked}
        disabled={disabled}
        aria-invalid={errorText ? 'true' : undefined}
        aria-describedby={describedByIds(resolvedId, help, errorText)}
        class={`checkbox ${errorText ? 'checkbox-error' : ''}`}
      />
    </Fieldset>
  )
}
