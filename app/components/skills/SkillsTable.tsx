import type { SkillOverview } from '../../../src/db/resource-queries'
import { skillReviewStatuses } from '../../../src/lib/skills/constants'
import { skillCategoryDefinitions, skillCategoryLabel } from '../../../src/lib/skills/taxonomy'
import type { SkillFilters } from './SkillsPage'

export function SkillsTable({
  skills,
  filters,
  oob = false,
}: {
  skills: SkillOverview[]
  filters: SkillFilters
  oob?: boolean
}) {
  const categories = skillCategoryDefinitions()
  const query = new URLSearchParams(filters).toString()
  return (
    <section id="skills-results" {...(oob ? { 'hx-swap-oob': 'outerHTML' } : {})}>
      <form
        class="card border border-base-300 bg-base-100"
        hx-get="/skills"
        hx-target="#skills-results"
        hx-swap="outerHTML"
        hx-push-url="true"
      >
        <div class="card-body gap-3 p-4">
          <div class="grid gap-3 sm:grid-cols-3">
            <input
              type="search"
              name="q"
              value={filters.q}
              placeholder="Search skills"
              class="input w-full"
            />
            <select name="category" class="select w-full">
              <option value="">All categories</option>
              {categories.map((category) => (
                <option value={category.key} selected={filters.category === category.key}>
                  {category.label}
                </option>
              ))}
            </select>
            <select name="status" class="select w-full">
              <option value="">All statuses</option>
              {skillReviewStatuses.map((status) => (
                <option value={status} selected={filters.status === status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
          <div class="flex justify-end">
            <button class="btn btn-sm">Filter</button>
          </div>
        </div>
      </form>

      <div class="mt-4 overflow-hidden rounded-box border border-base-300 bg-base-100">
        <table class="table table-sm">
          <caption class="sr-only">Skills</caption>
          <thead>
            <tr>
              <th>Name</th>
              <th>Category</th>
              <th>Status</th>
              <th>Origin</th>
              <th>Career mapping</th>
              <th>Aliases</th>
              <th>Applications</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {skills.map((skill) => (
              <tr class="border-base-200 hover:bg-base-200/50">
                <td class="font-medium">{skill.name}</td>
                <td>
                  {skill.category ? (skillCategoryLabel(skill.category) ?? skill.category) : '—'}
                </td>
                <td>
                  <span class="badge badge-outline badge-sm">{skill.reviewStatus}</span>
                </td>
                <td>{skill.origin}</td>
                <td>{skill.careerSkillId ?? '—'}</td>
                <td>{skill.aliasCount}</td>
                <td>{skill.applicationCount}</td>
                <td class="text-right">
                  <button
                    class="btn btn-ghost btn-sm"
                    hx-get={`/skills/${skill.id}?${query}`}
                    hx-target="#skill-workspace-panel"
                    hx-swap="innerHTML"
                    data-open-drawer="skill-workspace-toggle"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!skills.length && <p class="p-4 text-sm text-base-content/60">No skills found.</p>}
      </div>
    </section>
  )
}
