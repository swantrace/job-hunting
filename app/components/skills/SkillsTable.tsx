import type { SkillOverview } from '../../../src/db/resource-queries'
import {
  skillCategories,
  skillCategoryLabels,
  skillReviewStatuses,
} from '../../../src/lib/skills/constants'
import type { SkillFilters } from './SkillsPage'

export function SkillsTable({
  skills,
  filters,
}: {
  skills: SkillOverview[]
  filters: SkillFilters
}) {
  return (
    <section id="skills-results">
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
              {skillCategories.map((category) => (
                <option value={category} selected={filters.category === category}>
                  {skillCategoryLabels[category]}
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
            </tr>
          </thead>
          <tbody>
            {skills.map((skill) => (
              <tr class="border-base-200 hover:bg-base-200/50">
                <td class="font-medium">{skill.name}</td>
                <td>{skill.category ? skillCategoryLabels[skill.category] : '—'}</td>
                <td>
                  <span class="badge badge-outline badge-sm">{skill.reviewStatus}</span>
                </td>
                <td>{skill.origin}</td>
                <td>{skill.careerSkillId ?? '—'}</td>
                <td>{skill.aliasCount}</td>
                <td>{skill.applicationCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!skills.length && <p class="p-4 text-sm text-base-content/60">No skills found.</p>}
      </div>
    </section>
  )
}
