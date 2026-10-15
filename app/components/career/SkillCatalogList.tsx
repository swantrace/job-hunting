import type { CareerCatalogSkill } from '../../../src/db/career-data-view'
import type { CareerSkillRecord } from '../../../src/db/career-skills'
import { EmptyState } from '../ui/EmptyState'

/**
 * Catalog view: the approved, shared skill vocabulary. It is deliberately
 * read-only here and separate from "My skills": a catalog entry describes a
 * skill term, while a personal skill records that the candidate has it. Adding
 * or approving catalog entries belongs to the Skills manager, so this view can
 * never fabricate candidate facts.
 */
export function SkillCatalogList({
  catalogSkills,
  personalSkills,
}: {
  catalogSkills: CareerCatalogSkill[]
  personalSkills: CareerSkillRecord[]
}) {
  const claimed = new Map(personalSkills.map((skill) => [skill.skillId, skill]))
  return (
    <section id="career-skills-catalog" aria-labelledby="career-skills-catalog-heading">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="career-skills-catalog-heading" class="text-lg font-semibold">
            Catalog
          </h2>
          <p class="text-sm text-base-content/60">
            {catalogSkills.length} approved {catalogSkills.length === 1 ? 'entry' : 'entries'}{' '}
            available to claim.
          </p>
        </div>
        <a class="btn btn-ghost btn-sm" href="/skills">
          Manage the catalog
        </a>
      </div>

      <div role="note" class="alert alert-info mt-3 items-start">
        <p class="text-sm">
          The catalog is the shared skill vocabulary; it never claims you have a skill. A skill is
          yours only after you add it under “My skills”, and adding a personal skill never creates a
          catalog entry.
        </p>
      </div>

      {catalogSkills.length > 0 ? (
        <div class="mt-3 overflow-hidden rounded-box border border-base-300 bg-base-100">
          <table class="table table-sm">
            <caption class="sr-only">Approved catalog skills</caption>
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Key</th>
                <th>My skills</th>
              </tr>
            </thead>
            <tbody>
              {catalogSkills.map((skill) => {
                const personal = claimed.get(skill.id)
                return (
                  <tr class="border-base-200 hover:bg-base-200/50">
                    <td class="font-medium">{skill.name}</td>
                    <td>{skill.category ?? '—'}</td>
                    <td class="font-mono text-xs">{skill.key}</td>
                    <td>
                      {personal ? (
                        <span
                          class={`badge badge-sm whitespace-nowrap ${personal.retiredAt ? 'badge-warning' : 'badge-success'}`}
                        >
                          {personal.retiredAt ? 'Retired' : 'Claimed'}
                        </span>
                      ) : (
                        <span class="text-base-content/50">Not claimed</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="No approved catalog skills yet"
          description="Approve or create catalog entries in the Skills manager before claiming them."
        />
      )}
    </section>
  )
}
