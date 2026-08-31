import type { SkillOverview } from '../../../src/db/resource-queries'
import { skillReviewStatuses } from '../../../src/lib/skills/constants'
import { skillCategoryDefinitions } from '../../../src/lib/skills/taxonomy'
import type { FieldErrors } from '../../../src/lib/validation'
import { InputField, SelectField } from '../ui/FormField'
import { SkillMergeForm } from './SkillMergeForm'
import type { SkillFilters } from './SkillsPage'

export function SkillEditForm({
  skill,
  filters,
  errors,
  mergeTargets,
  mergeError,
}: {
  skill: SkillOverview
  filters: SkillFilters
  errors?: FieldErrors
  mergeTargets: SkillOverview[]
  mergeError?: string
}) {
  const query = new URLSearchParams(filters).toString()
  return (
    <section aria-labelledby="skill-edit-title">
      <div class="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 id="skill-edit-title" class="text-lg font-semibold">
            Edit skill
          </h2>
          <p class="text-sm text-base-content/60">Update the canonical skill record.</p>
        </div>
        <label
          for="skill-workspace-toggle"
          class="btn btn-ghost btn-square btn-sm"
          aria-label="Close"
        >
          ×
        </label>
      </div>
      <form
        hx-put={`/skills/${skill.id}?${query}`}
        hx-target="#skill-workspace-panel"
        hx-swap="innerHTML"
        hx-disabled-elt="find button"
        novalidate
        class="space-y-3"
      >
        <InputField
          name="name"
          label="Skill name"
          value={skill.name}
          required
          error={errors?.name?.[0]}
          dataPrimaryInput
        />
        <SelectField name="category" label="Category" error={errors?.category?.[0]}>
          <option value="">Uncategorized</option>
          {skillCategoryDefinitions().map((category) => (
            <option value={category.key} selected={skill.category === category.key}>
              {category.label}
            </option>
          ))}
        </SelectField>
        <SelectField name="reviewStatus" label="Review status" error={errors?.reviewStatus?.[0]}>
          {skillReviewStatuses
            .filter((status) => status !== 'merged')
            .map((status) => (
              <option value={status} selected={skill.reviewStatus === status}>
                {status}
              </option>
            ))}
        </SelectField>
        <div class="flex justify-end gap-2 pt-2">
          <label for="skill-workspace-toggle" class="btn btn-ghost">
            Cancel
          </label>
          <button class="btn btn-primary">Save changes</button>
        </div>
      </form>
      <SkillMergeForm skill={skill} targets={mergeTargets} filters={filters} error={mergeError} />
    </section>
  )
}
