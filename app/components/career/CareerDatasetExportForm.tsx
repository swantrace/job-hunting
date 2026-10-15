import { SelectField } from '../ui/form-fields/SelectField'

export const careerDatasetExportFormId = 'career-dataset-export-form'

/**
 * Portable `career-dataset` export: a full dataset, or one direction and the
 * records linked to it. The download is the versioned Step 3 format, identified
 * by its own `format: "career-dataset"` marker, so it can never be confused with
 * the v4 application backup exported at `/export`.
 */
export function CareerDatasetExportForm({
  directions,
  directionKey,
}: {
  directions: { key: string; label: string }[]
  directionKey: string
}) {
  return (
    <form
      id={careerDatasetExportFormId}
      class="card border border-base-300 bg-base-100"
      method="get"
      action="/career-data/transfer/export/dataset"
    >
      <div class="card-body gap-4">
        <h3 class="card-title text-base">Export the portable career dataset</h3>
        <p class="text-sm text-base-content/70">
          The versioned <code>career-dataset</code> JSON, mergeable by stable key into this database
          or another one. It is a different format from the v4 application backup at{' '}
          <a class="link" href="/export">
            /export
          </a>
          , which keeps its existing meaning and payload unchanged.
        </p>
        <SelectField
          id="career-dataset-direction"
          name="direction"
          label="Scope"
          value={directionKey}
          help="Direction scope keeps that direction, its Base Resumes and every record linked to it."
        >
          <option value="" selected={directionKey === ''}>
            Full dataset — every career fact and the whole catalog
          </option>
          {directions.map((direction) => (
            <option value={direction.key} selected={direction.key === directionKey}>
              {direction.label}
            </option>
          ))}
        </SelectField>
        <div class="card-actions justify-end">
          <button class="btn btn-primary">Download career dataset</button>
        </div>
      </div>
    </form>
  )
}
