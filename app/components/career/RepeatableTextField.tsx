import { TextareaField } from '../ui/FormField'

/**
 * Repeatable text collection (responsibilities, coursework, target titles)
 * edited as ordinary one-per-line text: order is editorial data, removing an
 * entry needs no script, and no raw JSON or client hydration is involved.
 */
export function RepeatableTextField({
  id,
  name,
  label,
  value,
  error,
  placeholder,
  help = 'One entry per line. Order is preserved.',
  rows = 5,
}: {
  id: string
  name: string
  label: string
  value: string
  error?: string
  placeholder?: string
  help?: string
  rows?: number
}) {
  return (
    <TextareaField
      id={id}
      name={name}
      label={label}
      value={value}
      rows={rows}
      placeholder={placeholder}
      help={help}
      error={error}
    />
  )
}
