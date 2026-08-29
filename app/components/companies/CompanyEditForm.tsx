import type { CompanyOverview } from '../../../src/db/resource-queries'
import type { FieldErrors } from '../../../src/lib/validation'
import { InputField } from '../ui/FormField'
import type { CompanyFilters } from './CompaniesPage'

export function CompanyEditForm({
  company,
  filters,
  errors,
}: {
  company: CompanyOverview
  filters: CompanyFilters
  errors?: FieldErrors
}) {
  const query = new URLSearchParams(filters).toString()
  return (
    <section aria-labelledby="company-edit-title">
      <div class="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 id="company-edit-title" class="text-lg font-semibold">
            Edit company
          </h2>
          <p class="text-sm text-base-content/60">Update the organization name and website.</p>
        </div>
        <label
          for="company-workspace-toggle"
          class="btn btn-ghost btn-square btn-sm"
          aria-label="Close"
        >
          ×
        </label>
      </div>
      <form
        hx-put={`/companies/${company.id}?${query}`}
        hx-target="#company-workspace-panel"
        hx-swap="innerHTML"
        hx-disabled-elt="find button"
        novalidate
        class="space-y-3"
      >
        <InputField
          name="name"
          label="Company name"
          value={company.name}
          required
          error={errors?.name?.[0]}
          dataPrimaryInput
        />
        <InputField
          name="website"
          label="Website"
          type="url"
          value={company.website ?? ''}
          error={errors?.website?.[0]}
        />
        <div class="flex justify-end gap-2 pt-2">
          <label for="company-workspace-toggle" class="btn btn-ghost">
            Cancel
          </label>
          <button class="btn btn-primary">Save changes</button>
        </div>
      </form>
    </section>
  )
}
