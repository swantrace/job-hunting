import type { Filters, JobCardData } from '../../../src/db/queries'
import type { FieldErrors } from '../../../src/lib/validation'
import { InputField } from '../ui/FormField'
import { query } from './helpers'

export function ContactsPanel({
  job,
  filters,
  errors,
  active = false,
}: {
  job: JobCardData
  filters: Filters
  errors?: FieldErrors
  active?: boolean
}) {
  return (
    <div
      id="workspace-contacts-panel"
      role="tabpanel"
      aria-labelledby="workspace-tab-contacts"
      data-workspace-panel
      class={active ? '' : 'hidden'}
    >
      <section>
        <div class="divider">Contacts</div>
        {job.contacts?.length ? (
          <ul class="mb-4 space-y-2">
            {job.contacts.map((contact) => (
              <li class="rounded-box border border-base-300 p-3">
                <div class="font-medium">{contact.name}</div>
                <div class="flex flex-wrap gap-x-4 text-sm text-base-content/70">
                  {contact.email && (
                    <a class="link" href={`mailto:${contact.email}`}>
                      {contact.email}
                    </a>
                  )}
                  {contact.linkedinUrl && (
                    <a class="link" href={contact.linkedinUrl} target="_blank" rel="noreferrer">
                      LinkedIn
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p class="mb-4 text-sm text-base-content/60">No contacts linked yet.</p>
        )}
        <form
          class="card bg-base-200"
          hx-post={`/applications/${job.id}/contacts?${query(filters)}`}
          hx-target="#workspace-contacts-panel"
          hx-swap="outerHTML"
          hx-vals='{"workspaceTab":"contacts"}'
          hx-disabled-elt="find button"
          novalidate
        >
          <div class="card-body grid gap-3 p-4 sm:grid-cols-3">
            <InputField label="Name" name="name" required error={errors?.name?.[0]} />
            <InputField label="Email" name="email" type="email" error={errors?.email?.[0]} />
            <InputField
              label="LinkedIn URL"
              name="linkedinUrl"
              type="url"
              error={errors?.linkedinUrl?.[0]}
            />
            <button class="btn btn-outline btn-sm sm:col-span-3">
              <span class="loading loading-spinner loading-sm htmx-indicator" /> Add contact
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
