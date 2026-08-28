import {
  skillCategories,
  skillCategoryLabels,
  skillImportances,
} from '../../src/lib/skills/constants'
import type { SkillRequirementDraft } from '../../src/lib/validation'

/**
 * Server-rendered editor for structured parser skill requirements. Editable
 * canonical name, category, and importance sync into the hidden JSON field via
 * the `updateSkillRequirements` handler so the form submits one authoritative
 * `skillRequirements` payload. Raw label, source excerpt, and confidence are
 * preserved unchanged.
 */
export function SkillRequirementsEditor({
  requirements,
}: {
  requirements: SkillRequirementDraft[]
}) {
  return (
    <div id="skill-requirements" class="sm:col-span-2">
      <fieldset class="fieldset rounded-box border border-base-300 bg-base-100 p-3">
        <legend class="fieldset-legend">Skills detected in the job post</legend>
        <p class="text-sm text-base-content/60">
          Correct the canonical name, category, or importance. The original wording and source
          excerpt are preserved for the gap review.
        </p>
        <div class="mt-2 space-y-3">
          {requirements.map((requirement, index) => (
            <div
              data-skill-row
              class="grid gap-2 rounded-lg border border-base-200 bg-base-200/40 p-3 md:grid-cols-3"
            >
              <input type="hidden" data-skill-raw value={requirement.rawLabel} />
              <input type="hidden" data-skill-source value={requirement.sourceText ?? ''} />
              <input type="hidden" data-skill-confidence value={requirement.confidence ?? 0} />
              <div>
                <label class="label" for={`skill-canonical-${index}`}>
                  Canonical name
                </label>
                <input
                  id={`skill-canonical-${index}`}
                  class="input input-sm w-full"
                  data-skill-canonical
                  value={requirement.canonicalLabel}
                  oninput="updateSkillRequirements()"
                />
              </div>
              <div>
                <label class="label" for={`skill-category-${index}`}>
                  Category
                </label>
                <select
                  id={`skill-category-${index}`}
                  class="select select-sm w-full"
                  data-skill-category
                  onchange="updateSkillRequirements()"
                >
                  {skillCategories.map((category) => (
                    <option
                      value={category}
                      selected={(requirement.category ?? skillCategories[0]) === category}
                    >
                      {skillCategoryLabels[category]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label class="label" for={`skill-importance-${index}`}>
                  Importance
                </label>
                <select
                  id={`skill-importance-${index}`}
                  class="select select-sm w-full"
                  data-skill-importance
                  onchange="updateSkillRequirements()"
                >
                  {skillImportances.map((importance) => (
                    <option value={importance} selected={requirement.importance === importance}>
                      {importance}
                    </option>
                  ))}
                </select>
              </div>
              <p class="text-xs text-base-content/60 md:col-span-3">
                Source: “{requirement.sourceText ?? ''}”
              </p>
            </div>
          ))}
        </div>
      </fieldset>
      <textarea name="skillRequirements" class="hidden">
        {JSON.stringify(requirements)}
      </textarea>
    </div>
  )
}
