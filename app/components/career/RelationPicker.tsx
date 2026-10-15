import { Fieldset } from '../ui/FormField'
import { describedByIds } from '../ui/form-fields/helpers'
import { SelectField } from '../ui/form-fields/SelectField'

/**
 * A reference the picker can offer. `value` is the stable identity that is
 * submitted and persisted (an id or an external stable key), while `label` is
 * the human name the referenced record currently carries; renaming the target
 * therefore changes the shown name without breaking the stored reference.
 */
export type RelationOption = {
  value: string
  label: string
  detail?: string
}

/**
 * Server-rendered reference picker. It shows the referenced names, persists ids
 * or stable keys, and needs no client JavaScript: a single reference is one
 * native `<select>`, several references are an ordered checkbox list whose
 * submission order is the option order. Every control is a native form element,
 * so it is keyboard and screen-reader accessible by default.
 *
 * Only active, usable targets are ever passed in: a retired experience, a
 * retired direction/project/publication or a non-approved catalog skill is not
 * an option, so the picker can never propose an ineligible source.
 */
export function RelationPicker({
  id,
  name,
  label,
  options,
  value,
  multiple = true,
  noneLabel = 'None',
  emptyMessage = 'Nothing is available to reference yet.',
  help,
  error,
  required,
}: {
  id: string
  name: string
  label: string
  options: RelationOption[]
  /** Newline-joined selected values, the editable shape the form stores. */
  value: string
  multiple?: boolean
  noneLabel?: string
  emptyMessage?: string
  help?: string
  error?: string
  required?: boolean
}) {
  const selected = new Set(
    value
      .split('\n')
      .map((entry) => entry.trim())
      .filter(Boolean),
  )
  if (!multiple) {
    return (
      <SelectField id={id} name={name} label={label} help={help} error={error} required={required}>
        <option value="">{noneLabel}</option>
        {options.map((option) => (
          <option value={option.value} selected={selected.has(option.value)}>
            {option.detail ? `${option.label} — ${option.detail}` : option.label}
          </option>
        ))}
      </SelectField>
    )
  }

  return (
    <Fieldset id={id} label={label} required={required} help={help} error={error}>
      <div
        role="group"
        aria-describedby={describedByIds(id, help, error)}
        class="max-h-72 space-y-1 overflow-y-auto rounded-box border border-base-300 bg-base-100 p-2"
      >
        {options.length === 0 ? (
          <p class="label">{emptyMessage}</p>
        ) : (
          options.map((option) => (
            <label class="flex cursor-pointer items-center gap-2 py-1">
              <input
                type="checkbox"
                name={name}
                value={option.value}
                checked={selected.has(option.value)}
                class="checkbox checkbox-sm"
              />
              <span class="font-medium">{option.label}</span>
              {option.detail ? (
                <span class="text-xs text-base-content/60">{option.detail}</span>
              ) : null}
            </label>
          ))
        )}
      </div>
      <p class="label">
        {selected.size > 0
          ? `Selected: ${options
              .filter((option) => selected.has(option.value))
              .map((option) => option.label)
              .join(', ')}`
          : 'No references selected.'}
      </p>
    </Fieldset>
  )
}
