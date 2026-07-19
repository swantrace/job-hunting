import type { listManagementData } from '../../src/db/queries'

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
    <main class="mx-auto min-h-screen max-w-7xl space-y-5 p-4 lg:p-7">
      <header>
        <a class="link text-sm" href="/">
          ← Dashboard
        </a>
        <h1 class="mt-2 text-3xl font-bold">Manage data</h1>
        <p class="text-base-content/60">Keep reusable skills, companies, and contacts organized.</p>
      </header>
      <ManagementContent data={data} />
    </main>
  )
}

export function ManagementContent({ data }: { data: ManagementData }) {
  return (
    <div id="management-content" class="grid gap-5 lg:grid-cols-3">
      <ManagementCard kind="skills" title="Skills" data={data} />
      <ManagementCard kind="companies" title="Companies" data={data} />
      <ManagementCard kind="contacts" title="Contacts" data={data} />
    </div>
  )
}

function ManagementCard({
  kind,
  title,
  data,
}: {
  kind: ManagementKind
  title: string
  data: ManagementData
}) {
  return (
    <section class="card bg-base-100 shadow-sm">
      <div class="card-body">
        <h2 class="card-title">{title}</h2>
        <ManagementForm kind={kind} data={data} />
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
                          {company.name} ↗
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
}: {
  kind: ManagementKind
  data: ManagementData
  editId?: number
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
      >
        <p class="text-sm font-medium">{title}</p>
        {kind === 'skills' ? (
          <div class="join w-full">
            <input
              class="input input-bordered join-item w-full"
              name="name"
              value={skill?.name ?? ''}
              placeholder="e.g. backend"
              required
              data-primary-input
            />
            <button class="btn btn-primary join-item">{editing ? 'Save' : 'Add'}</button>
            {editing && <CancelButton kind={kind} />}
          </div>
        ) : kind === 'companies' ? (
          <>
            <input
              class="input input-bordered w-full"
              name="name"
              value={company?.name ?? ''}
              placeholder="Company name"
              required
              data-primary-input
            />
            <div class="join w-full">
              <input
                class="input input-bordered join-item w-full"
                name="website"
                type="url"
                value={company?.website ?? ''}
                placeholder="Website (optional)"
              />
              <button class="btn btn-primary join-item">{editing ? 'Save' : 'Add'}</button>
              {editing && <CancelButton kind={kind} />}
            </div>
          </>
        ) : (
          <>
            <input
              class="input input-bordered w-full"
              name="name"
              value={contact?.name ?? ''}
              placeholder="Contact name"
              required
              data-primary-input
            />
            <select class="select select-bordered w-full" name="companyId" required>
              <option value="">Select company</option>
              {data.companies.map((entry) => (
                <option value={entry.id} selected={entry.id === contact?.companyId}>
                  {entry.name}
                </option>
              ))}
            </select>
            <input
              class="input input-bordered w-full"
              name="email"
              type="email"
              value={contact?.email ?? ''}
              placeholder="Email (optional)"
            />
            <div class="join w-full">
              <input
                class="input input-bordered join-item w-full"
                name="linkedinUrl"
                type="url"
                value={contact?.linkedinUrl ?? ''}
                placeholder="LinkedIn URL (optional)"
              />
              <button class="btn btn-primary join-item">{editing ? 'Save' : 'Add'}</button>
              {editing && <CancelButton kind={kind} />}
            </div>
          </>
        )}
      </form>
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
