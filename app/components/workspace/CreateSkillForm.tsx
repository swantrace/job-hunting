import type { SkillCategoryDefinition } from '../../../src/lib/skills/taxonomy'
import { InputField } from '../ui/form-fields/InputField'
import { SelectField } from '../ui/form-fields/SelectField'

const skillNameMaxLength = 80

/**
 * The explicit "Create new skill…" form: a name plus a category from the
 * current taxonomy. The stable key is derived with `canonicalSkillKey` on the
 * server, so ordinary users never type a key, and a key/name/alias collision is
 * reported on this field only as a 422 — never by merging or overwriting an
 * existing catalog entry.
 *
 * Creating a catalog entry does not add the skill to the candidate's career
 * data and creates no alias unless the separate Remember-as-alias action asked
 * for one.
 */
export function CreateSkillForm({
  categories,
  action,
  term,
  selectedCategory,
  mentionId,
  errors,
}: {
  categories: SkillCategoryDefinition[]
  action: string
  term: string
  selectedCategory: string | null
  mentionId: number | null
  errors?: { name?: string; category?: string }
}) {
  return (
    <section
      id="skill-mapping-create"
      class="rounded-box border border-base-300 p-4"
      aria-labelledby="create-skill-form-heading"
    >
      <h3 id="create-skill-form-heading" class="font-semibold">
        Create a new catalog skill
      </h3>
      <p class="mt-1 text-sm text-base-content/60">
        Adds an approved catalog entry so this term can be mapped. It does not mark the skill as
        yours, and the stable key is generated from the name.
      </p>
      <form
        id="create-skill-form"
        class="mt-3"
        hx-post={action}
        hx-target="#create-skill-form"
        hx-swap="outerHTML"
        hx-disabled-elt="find button"
        novalidate
      >
        <input type="hidden" name="action" value="create-skill" />
        {mentionId ? <input type="hidden" name="mentionId" value={mentionId} /> : null}
        <InputField
          id="create-skill-name"
          name="name"
          label="Skill name"
          value={term}
          required
          maxLength={skillNameMaxLength}
          placeholder="e.g. Kubernetes"
          help="Stored as an approved catalog entry with a generated stable key."
          error={errors?.name}
          dataPrimaryInput
        />
        <SelectField
          id="create-skill-category"
          name="category"
          label="Category"
          error={errors?.category}
        >
          <option value="">No category</option>
          {categories.map((category) => (
            <option value={category.key} selected={category.key === selectedCategory}>
              {category.label}
            </option>
          ))}
        </SelectField>
        <button type="submit" class="btn btn-secondary btn-sm mt-3">
          Create catalog skill
        </button>
      </form>
    </section>
  )
}
