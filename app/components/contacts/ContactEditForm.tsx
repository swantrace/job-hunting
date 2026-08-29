import type { CompanyOverview, ContactOverview } from '../../../src/db/resource-queries'
import type { FieldErrors } from '../../../src/lib/validation'
import { InputField, SelectField } from '../ui/FormField'
import type { ContactFilters } from './ContactsPage'

export function ContactEditForm({
  contact,
  companies,
  filters,
  errors,
}: {
  contact: ContactOverview
  companies: CompanyOverview[]
  filters: ContactFilters
  errors?: FieldErrors
}) {
  const query = new URLSearchParams(filters).toString()
  return (
    <section aria-labelledby="contact-edit-title">
      <div class="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 id="contact-edit-title" class="text-lg font-semibold">
            Edit contact
          </h2>
          <p class="text-sm text-base-content/60">Update contact details and company.</p>
        </div>
        <label
          for="contact-workspace-toggle"
          class="btn btn-ghost btn-square btn-sm"
          aria-label="Close"
        >
          ×
        </label>
      </div>
      <form
        hx-put={`/contacts/${contact.id}?${query}`}
        hx-target="#contact-workspace-panel"
        hx-swap="innerHTML"
        hx-disabled-elt="find button"
        novalidate
        class="space-y-3"
      >
        <InputField
          name="name"
          label="Contact name"
          value={contact.name}
          required
          error={errors?.name?.[0]}
          dataPrimaryInput
        />
        <SelectField name="companyId" label="Company" required error={errors?.companyId?.[0]}>
          {companies.map((company) => (
            <option value={company.id} selected={company.id === contact.companyId}>
              {company.name}
            </option>
          ))}
        </SelectField>
        <InputField
          name="email"
          label="Email"
          type="email"
          value={contact.email ?? ''}
          error={errors?.email?.[0]}
        />
        <InputField
          name="linkedinUrl"
          label="LinkedIn URL"
          type="url"
          value={contact.linkedinUrl ?? ''}
          error={errors?.linkedinUrl?.[0]}
        />
        <div class="flex justify-end gap-2 pt-2">
          <label for="contact-workspace-toggle" class="btn btn-ghost">
            Cancel
          </label>
          <button class="btn btn-primary">Save changes</button>
        </div>
      </form>
    </section>
  )
}
