import { TextareaField } from '../ui/FormField'

/**
 * Ordinary editor for preserved extension fields (the loose JSON columns and the
 * per-record extension store). `key = value`, one per line, so no raw JSON is
 * ever required from a normal user and no preserved fact is left uneditable.
 */
export function ExtensionFieldsEditor({
  id,
  name = 'extensionFields',
  value,
  error,
  label = 'Extension fields',
  help = 'Preserved fields with no dedicated control. One "key = value" per line; delete a line to remove the field.',
  rows = 4,
}: {
  id: string
  name?: string
  value: string
  error?: string
  label?: string
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
      placeholder="importSource = legacy export"
      help={help}
      error={error}
    />
  )
}
