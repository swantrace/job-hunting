import type { listManagementData } from '../../src/db/queries'
import type { ManagementKind } from './Management'
import { InputField, SelectField } from './ui/FormField'

type ManagementData = ReturnType<typeof listManagementData>

export function ManagementForm({
  kind,
  data,
  editId,
  error,
}: {
  kind: ManagementKind
  data: ManagementData
  editId?: number
  error?: string
}) {
  const editing = !!editId
  const skill = editId ? data.skills.find((item) => item.id === editId) : undefined
  const company = editId ? data.companies.find((item) => item.id === editId) : undefined
  const contact = editId
    ? data.contacts.find((item) => item.contact.id === editId)?.contact
    : undefined
  const action = editing ? `/manage/${kind}/${editId}` : `/manage/${kind}`
  const method = editing ? 'hx-put' : 'hx-post'
  const title = editing ? `Edit ${kind.slice(0, -1)}` : `Add ${kind.slice(0, -1)}`
  return (
    <div
      id={`${kind}-form-region`}
      {...(editing ? { 'data-autofocus': 'true', tabindex: -1 } : {})}
    >
      <form
        class="space-y-2"
        {...{ [method]: action }}
        hx-target="#management-content"
        hx-swap="outerHTML"
        hx-disabled-elt="find button"
      >
        <p class="text-sm font-medium">{title}</p>
        {error ? (
          <div class="alert alert-error text-sm" role="alert">
            {error}
          </div>
        ) : null}
        {kind === 'skills' ? (
          <>
            <InputField
              name="name"
              label="Skill name"
              value={skill?.name ?? ''}
              placeholder="e.g. backend"
              required
              dataPrimaryInput
            />
            <SubmitRow editing={editing} kind={kind} />
          </>
        ) : kind === 'companies' ? (
          <>
            <InputField
              name="name"
              label="Company name"
              value={company?.name ?? ''}
              placeholder="Company name"
              required
              dataPrimaryInput
            />
            <InputField
              name="website"
              label="Website"
              type="url"
              value={company?.website ?? ''}
              placeholder="Website (optional)"
            />
            <SubmitRow editing={editing} kind={kind} />
          </>
        ) : (
          <>
            <InputField
              name="name"
              label="Contact name"
              value={contact?.name ?? ''}
              placeholder="Contact name"
              required
              dataPrimaryInput
            />
            <SelectField name="companyId" label="Company" required>
              <option value="">Select company</option>
              {data.companies.map((entry) => (
                <option value={entry.id} selected={entry.id === contact?.companyId}>
                  {entry.name}
                </option>
              ))}
            </SelectField>
            <InputField
              name="email"
              label="Email"
              type="email"
              value={contact?.email ?? ''}
              placeholder="Email (optional)"
            />
            <InputField
              name="linkedinUrl"
              label="LinkedIn URL"
              type="url"
              value={contact?.linkedinUrl ?? ''}
              placeholder="LinkedIn URL (optional)"
            />
            <SubmitRow editing={editing} kind={kind} />
          </>
        )}
      </form>
    </div>
  )
}

function SubmitRow({ editing, kind }: { editing: boolean; kind: ManagementKind }) {
  return (
    <div class="flex items-center gap-2">
      <button class="btn btn-primary">{editing ? 'Save' : 'Add'}</button>
      <span class="loading loading-spinner loading-sm htmx-indicator" />
      {editing ? <CancelButton kind={kind} /> : null}
    </div>
  )
}
function CancelButton({ kind }: { kind: ManagementKind }) {
  return (
    <button
      class="btn btn-ghost join-item"
      type="button"
      hx-get={`/manage/${kind}/form`}
      hx-target={`#${kind}-form-region`}
      hx-swap="outerHTML"
    >
      Cancel
    </button>
  )
}
