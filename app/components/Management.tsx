import type { listManagementData } from '../../src/db/queries'
import { AppShell } from './layout/AppShell'
import { InputField, SelectField } from './ui/FormField'
import { Icon } from './ui/Icon'

type ManagementData = ReturnType<typeof listManagementData>
export type ManagementKind = 'skills' | 'companies' | 'contacts'

const deleteButton = (kind: ManagementKind, id: number) => (
  <button
    class="btn btn-ghost btn-xs text-error"
    hx-delete={`/manage/${kind}/${id}`}
    hx-target="#management-content"
    hx-swap="outerHTML"
    hx-confirm="Remove this item?"
  >
    Remove
  </button>
)

export function ManagementPage({ data }: { data: ManagementData }) {
  return (
    <AppShell
      title="Manage data"
      description="Keep reusable skills, companies, and contacts organized."
    >
      <ManagementContent data={data} />
    </AppShell>
  )
}

export function ManagementContent({
  data,
  error,
  errorKind,
  editId,
}: {
  data: ManagementData
  error?: string
  errorKind?: ManagementKind
  editId?: number
}) {
  return (
    <div id="management-content" class="grid gap-5 lg:grid-cols-3">
      <ManagementCard
        kind="skills"
        title="Skills"
        data={data}
        error={errorKind === 'skills' ? error : undefined}
        editId={errorKind === 'skills' ? editId : undefined}
      />
      <ManagementCard
        kind="companies"
        title="Companies"
        data={data}
        error={errorKind === 'companies' ? error : undefined}
        editId={errorKind === 'companies' ? editId : undefined}
      />
      <ManagementCard
        kind="contacts"
        title="Contacts"
        data={data}
        error={errorKind === 'contacts' ? error : undefined}
        editId={errorKind === 'contacts' ? editId : undefined}
      />
    </div>
  )
}

function ManagementCard({
  kind,
  title,
  data,
  error,
  editId,
}: {
  kind: ManagementKind
  title: string
  data: ManagementData
  error?: string
  editId?: number
}) {
  return (
    <section class="card bg-base-100 shadow-sm">
      <div class="card-body">
        <h2 class="card-title">{title}</h2>
        <ManagementForm kind={kind} data={data} editId={editId} error={error} />
        <ul class="mt-3 divide-y divide-base-300">
          {kind === 'skills'
            ? data.skills.map((skill) => (
                <li class="flex items-center justify-between py-2">
                  <span class="badge badge-outline">{skill.name}</span>
                  <div>
                    <EditButton kind={kind} id={skill.id} />
                    {deleteButton(kind, skill.id)}
                  </div>
                </li>
              ))
            : kind === 'companies'
              ? data.companies.map((company) => (
                  <li class="flex items-center justify-between gap-2 py-2">
                    <div class="min-w-0">
                      {company.website ? (
                        <a
                          class="link font-medium"
                          href={company.website}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {company.name} <Icon name="external" className="inline size-3" />
                        </a>
                      ) : (
                        <span class="font-medium">{company.name}</span>
                      )}
                    </div>
                    <div>
                      <EditButton kind={kind} id={company.id} />
                      {deleteButton(kind, company.id)}
                    </div>
                  </li>
                ))
              : data.contacts.map(({ contact, companyName }) => (
                  <li class="flex items-center justify-between gap-2 py-2">
                    <div>
                      <div class="font-medium">{contact.name}</div>
                      <div class="text-xs text-base-content/60">{companyName}</div>
                    </div>
                    <div>
                      <EditButton kind={kind} id={contact.id} />
                      {deleteButton(kind, contact.id)}
                    </div>
                  </li>
                ))}
        </ul>
      </div>
    </section>
  )
}

function EditButton({ kind, id }: { kind: ManagementKind; id: number }) {
  return (
    <button
      class="btn btn-ghost btn-xs"
      hx-get={`/manage/${kind}/${id}/form`}
      hx-target={`#${kind}-form-region`}
      hx-swap="outerHTML"
    >
      Edit
    </button>
  )
}

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
  const item = skill ?? company ?? contact
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
      {editing && <CancelButton kind={kind} />}
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
