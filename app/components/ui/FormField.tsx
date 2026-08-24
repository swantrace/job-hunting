import type { Child } from 'hono/jsx'
import { Icon } from './Icon'

/**
 * Server-only daisyUI 5 form primitives.
 *
 * Every control renders inside a `fieldset` whose `fieldset-legend` acts as the
 * accessible name. Help and error text are rendered as `label` descriptions and
 * connected to the control through `aria-describedby`; `aria-invalid` is set only
 * when an error is present. IDs are derived from an explicit `id` or a form
 * `namespace` plus the field `name`.
 */

export type FieldBaseProps = {
  id?: string
  /** Prepends a namespace to generated IDs, e.g. `quick` + `jobTitle` -> `quick-jobTitle`. */
  namespace?: string
  name: string
  label: string
  value?: string | number | null
  required?: boolean
  disabled?: boolean
  placeholder?: string
  help?: string
  error?: string
  /** Backwards-compatible alias for `error`; prefer `error`. */
  message?: string
  /** Rendered beside the legend (e.g. an external link), never nested inside a label. */
  labelAction?: Child
}

export function resolveFieldId(
  id: string | undefined,
  namespace: string | undefined,
  name: string,
) {
  if (id) return id
  return namespace ? `${namespace}-${name}` : name
}

function describedByIds(id: string, help?: string, error?: string) {
  const ids = [help ? `${id}-help` : null, error ? `${id}-error` : null].filter(Boolean)
  return ids.length ? ids.join(' ') : undefined
}

export function FieldHelp({ id, children }: { id: string; children: Child }) {
  return (
    <p id={id} class="label">
      {children}
    </p>
  )
}

export function FieldError({ id, children }: { id: string; children: Child }) {
  return (
    <p id={id} class="label text-error" role="alert">
      {children}
    </p>
  )
}

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

export type InputFieldProps = FieldBaseProps & {
  type?: string
  list?: string
  maxLength?: number
  /** When present, renders an adjacent "open in new tab" action outside the label. */
  externalUrl?: string | null
  /** Marks the control as the primary focus target for auto-focus regions. */
  dataPrimaryInput?: boolean
}

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

export type SelectFieldProps = FieldBaseProps & {
  children: Child
}

export function SelectField({
  id,
  namespace,
  name,
  label,
  required,
  disabled,
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

export type TextareaFieldProps = FieldBaseProps & {
  rows?: number
  maxLength?: number
}

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

export type FileFieldProps = FieldBaseProps & {
  accept?: string
  multiple?: boolean
}

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
