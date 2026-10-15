import type { CareerDatePrecision } from '../../../src/db/career-records'
import { datePrecisionPlaceholder } from '../../../src/lib/career/form-input'
import type { FieldErrors } from '../../../src/lib/validation'
import { InputField, SelectField } from '../ui/FormField'

const precisions: CareerDatePrecision[] = ['day', 'month', 'year']

function precisionOf(value: string | undefined): CareerDatePrecision {
  return value === 'month' || value === 'year' ? value : 'day'
}

/**
 * Date precision is a real control, not a display string: the stored date is
 * validated against the chosen precision, so a year-only or month-only fact is
 * never padded into an invented day or month. The optional display string stays
 * editable next to the precision.
 */
export function DatePrecisionFields({
  idPrefix,
  startName,
  endName,
  precisionName,
  displayName,
  values,
  errors,
  startLabel = 'Start date',
  endLabel = 'End date',
}: {
  idPrefix: string
  startName: string
  endName: string
  precisionName: string
  displayName?: string
  values: Record<string, string>
  errors?: FieldErrors
  startLabel?: string
  endLabel?: string
}) {
  const precision = precisionOf(values[precisionName])
  const placeholder = datePrecisionPlaceholder[precision]
  return (
    <div class="grid gap-2 sm:grid-cols-2">
      <InputField
        id={`${idPrefix}-start`}
        name={startName}
        label={startLabel}
        value={values[startName] ?? ''}
        placeholder={placeholder}
        error={errors?.[startName]?.[0]}
        help={`Stored exactly as typed: ${placeholder}.`}
      />
      <InputField
        id={`${idPrefix}-end`}
        name={endName}
        label={endLabel}
        value={values[endName] ?? ''}
        placeholder={placeholder}
        error={errors?.[endName]?.[0]}
      />
      <SelectField
        id={`${idPrefix}-precision`}
        name={precisionName}
        label="Date precision"
        error={errors?.[precisionName]?.[0]}
        help="Dates are stored at this precision; no day or month is invented."
      >
        {precisions.map((option) => (
          <option value={option} selected={option === precision}>
            {option}
          </option>
        ))}
      </SelectField>
      {displayName ? (
        <InputField
          id={`${idPrefix}-display`}
          name={displayName}
          label="Display dates"
          value={values[displayName] ?? ''}
          error={errors?.[displayName]?.[0]}
          help="Optional text shown on documents; leave blank to use the stored dates."
        />
      ) : null}
    </div>
  )
}
