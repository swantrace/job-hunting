import type { listManagementData } from '../../src/db/queries'

type ManagementData = ReturnType<typeof listManagementData>

const deleteButton = (kind: string, id: number) => (
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
      <header class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <a class="link text-sm" href="/">
            ← Dashboard
          </a>
          <h1 class="mt-2 text-3xl font-bold">Manage data</h1>
          <p class="text-base-content/60">
            Keep reusable skills, companies, and contacts organized.
          </p>
        </div>
      </header>
      <ManagementContent data={data} />
    </main>
  )
}

export function ManagementContent({ data }: { data: ManagementData }) {
  return (
    <div id="management-content" class="grid gap-5 lg:grid-cols-3">
      <section class="card bg-base-100 shadow-sm">
        <div class="card-body">
          <h2 class="card-title">Skills</h2>
          <form
            class="join"
            hx-post="/manage/skills"
            hx-target="#management-content"
            hx-swap="outerHTML"
          >
            <input
              class="input input-bordered join-item w-full"
              name="name"
              placeholder="e.g. backend"
              required
            />
            <button class="btn btn-primary join-item">Add</button>
          </form>
          <ul class="mt-3 divide-y divide-base-300">
            {data.skills.map((skill) => (
              <li class="flex items-center justify-between py-2">
                <span class="badge badge-outline">{skill.name}</span>
                {deleteButton('skills', skill.id)}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section class="card bg-base-100 shadow-sm">
        <div class="card-body">
          <h2 class="card-title">Companies</h2>
          <form
            class="space-y-2"
            hx-post="/manage/companies"
            hx-target="#management-content"
            hx-swap="outerHTML"
          >
            <input
              class="input input-bordered w-full"
              name="name"
              placeholder="Company name"
              required
            />
            <div class="join w-full">
              <input
                class="input input-bordered join-item w-full"
                name="website"
                type="url"
                placeholder="Website (optional)"
              />
              <button class="btn btn-primary join-item">Add</button>
            </div>
          </form>
          <ul class="mt-3 divide-y divide-base-300">
            {data.companies.map((company) => (
              <li class="flex items-center justify-between gap-2 py-2">
                <div>
                  <div class="font-medium">{company.name}</div>
                  {company.website && (
                    <a class="link text-xs" href={company.website}>
                      {company.website}
                    </a>
                  )}
                </div>
                {deleteButton('companies', company.id)}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section class="card bg-base-100 shadow-sm">
        <div class="card-body">
          <h2 class="card-title">Contacts</h2>
          <form
            class="space-y-2"
            hx-post="/manage/contacts"
            hx-target="#management-content"
            hx-swap="outerHTML"
          >
            <input
              class="input input-bordered w-full"
              name="name"
              placeholder="Contact name"
              required
            />
            <select class="select select-bordered w-full" name="companyId" required>
              <option value="">Select company</option>
              {data.companies.map((company) => (
                <option value={company.id}>{company.name}</option>
              ))}
            </select>
            <input
              class="input input-bordered w-full"
              name="email"
              type="email"
              placeholder="Email (optional)"
            />
            <div class="join w-full">
              <input
                class="input input-bordered join-item w-full"
                name="linkedinUrl"
                type="url"
                placeholder="LinkedIn URL (optional)"
              />
              <button class="btn btn-primary join-item">Add</button>
            </div>
          </form>
          <ul class="mt-3 divide-y divide-base-300">
            {data.contacts.map(({ contact, companyName }) => (
              <li class="flex items-center justify-between gap-2 py-2">
                <div>
                  <div class="font-medium">{contact.name}</div>
                  <div class="text-xs text-base-content/60">{companyName}</div>
                </div>
                {deleteButton('contacts', contact.id)}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  )
}
