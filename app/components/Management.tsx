import type { listManagementData } from '../../src/db/queries'
import { Icon } from './ui/Icon'
import { ManagementForm } from './ManagementForm'

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
