import type { SkillOverview } from '../../../src/db/resource-queries'
import type { SkillFilters } from './SkillsPage'

export function SkillMergeForm({
  skill,
  targets,
  filters,
  error,
}: {
  skill: SkillOverview
  targets: SkillOverview[]
  filters: SkillFilters
  error?: string
}) {
  const query = new URLSearchParams(filters).toString()
  return (
    <form
      class="mt-6 border-t border-base-300 pt-5"
      hx-post={`/skills/${skill.id}/merge?${query}`}
      hx-target="#skill-workspace-panel"
      hx-swap="innerHTML"
      hx-disabled-elt="find button"
      hx-confirm="Merge this skill into the selected canonical skill? This cannot be undone."
    >
      <fieldset class="fieldset">
        <legend class="fieldset-legend">Merge duplicate skill</legend>
        <p class="label">
          Move aliases, requirement links, and compatible decisions to another skill.
        </p>
        <select
          name="targetSkillId"
          class={`select w-full ${error ? 'select-error' : ''}`}
          required
          aria-describedby={error ? 'merge-skill-error' : undefined}
        >
          <option value="">Select canonical target</option>
          {targets.map((target) => (
            <option value={target.id}>
              {target.name} ({target.key})
            </option>
          ))}
        </select>
        {error && (
          <p id="merge-skill-error" class="label text-error">
            {error}
          </p>
        )}
      </fieldset>
      <div class="mt-3 flex justify-end">
        <button class="btn btn-error btn-outline" disabled={!targets.length}>
          Merge skill
        </button>
      </div>
    </form>
  )
}
