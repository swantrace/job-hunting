import { Icon } from '../Icon'
import { Fieldset } from './Fieldset'
import { describedByIds, resolveFieldId } from './helpers'
import type { InputFieldProps } from './types'

export function InputField({
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
  type = 'text',
  list,
  maxLength,
  externalUrl,
  dataPrimaryInput,
  labelAction,
}: InputFieldProps) {
  const resolvedId = resolveFieldId(id, namespace, name)
  const errorText = error ?? message
  const control = (
    <input
      id={resolvedId}
      name={name}
      type={type}
      value={value ?? ''}
      required={required}
      disabled={disabled}
      placeholder={placeholder}
      list={list}
      maxLength={maxLength}
      aria-invalid={errorText ? 'true' : undefined}
      aria-describedby={describedByIds(resolvedId, help, errorText)}
      {...(dataPrimaryInput ? { 'data-primary-input': 'true' } : {})}
      class={`input w-full ${externalUrl ? 'join-item' : ''} ${errorText ? 'input-error' : ''}`}
    />
  )
  return (
    <Fieldset
      id={resolvedId}
      label={label}
      required={required}
      help={help}
      error={errorText}
      labelAction={labelAction}
    >
      {externalUrl ? (
        <div class="join w-full">
          {control}
          <a
            class="btn btn-ghost join-item"
            href={externalUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open ${label} in a new tab`}
          >
            <Icon name="external" />
          </a>
        </div>
      ) : (
        control
      )}
    </Fieldset>
  )
}
