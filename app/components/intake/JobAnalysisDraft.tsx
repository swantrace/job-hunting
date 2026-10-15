import { type JobAnalysis, roleTypes, seniorities } from '../../../src/ai/schemas/job-analysis'
import {
  requirementImportances,
  requirementTypes,
} from '../../../src/lib/job-requirements/constants'

const emphasisFields = [
  ['frontend', 'Frontend'],
  ['backend', 'Backend'],
  ['testingQuality', 'Testing & quality'],
  ['devopsInfrastructure', 'DevOps & infrastructure'],
  ['collaborationOwnership', 'Collaboration & ownership'],
] as const

const listSections = [
  ['painPoints', 'Pain points', 'data-ja-pain'],
  ['culture', 'Culture signals', 'data-ja-culture'],
  ['redFlags', 'Red flags', 'data-ja-red-flag'],
  ['successMetrics', 'Success metrics', 'data-ja-success'],
  ['benefits', 'Benefits', 'data-ja-benefit'],
] as const

/**
 * Server-rendered editor for the structured, candidate-independent job
 * analysis. Editable classification, requirement wording and evidence lists sync
 * into the hidden `jobAnalysis` JSON field via `updateJobAnalysis`; source
 * excerpts stay read-only so editing a reviewed statement never rewrites the
 * original quote.
 *
 * Each requirement's skill terms are the parser's raw wording and stay
 * read-only here: the server resolves them against the curated catalog, and a
 * human confirms or skips each unresolved term in Review.
 */
export function JobAnalysisDraft({ analysis }: { analysis: JobAnalysis }) {
  const emphasis = analysis.classification.functionalEmphasis
  return (
    <div
      id="job-analysis-draft"
      class="mt-5 space-y-4 rounded-box border border-base-300 bg-base-200/40 p-4"
    >
      <div class="flex items-center justify-between gap-2">
        <h3 class="font-semibold">Structured job analysis</h3>
        <span class="badge badge-outline badge-sm">AI draft — review before saving</span>
      </div>

      <section class="space-y-3">
        <label class="fieldset">
          <legend class="fieldset-legend">Role purpose</legend>
          <textarea
            class="textarea w-full"
            rows={3}
            data-ja-role-purpose
            oninput="updateJobAnalysis()"
          >
            {analysis.summary.rolePurpose}
          </textarea>
        </label>
        <label class="fieldset">
          <legend class="fieldset-legend">Ideal candidate (as described by the posting)</legend>
          <textarea
            class="textarea w-full"
            rows={3}
            data-ja-ideal-candidate
            oninput="updateJobAnalysis()"
          >
            {analysis.summary.idealCandidate}
          </textarea>
        </label>
      </section>

      <section class="grid gap-3 sm:grid-cols-3">
        <label class="fieldset">
          <legend class="fieldset-legend">Role type</legend>
          <select class="select w-full" data-ja-role-type onchange="updateJobAnalysis()">
            {roleTypes.map((type) => (
              <option value={type} selected={analysis.classification.roleType === type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label class="fieldset">
          <legend class="fieldset-legend">Advertised seniority</legend>
          <select class="select w-full" data-ja-advertised onchange="updateJobAnalysis()">
            {seniorities.map((level) => (
              <option
                value={level}
                selected={analysis.classification.advertisedSeniority === level}
              >
                {level}
              </option>
            ))}
          </select>
        </label>
        <label class="fieldset">
          <legend class="fieldset-legend">Practical seniority</legend>
          <select class="select w-full" data-ja-practical onchange="updateJobAnalysis()">
            {seniorities.map((level) => (
              <option value={level} selected={analysis.classification.practicalSeniority === level}>
                {level}
              </option>
            ))}
          </select>
        </label>
        <label class="fieldset sm:col-span-3">
          <legend class="fieldset-legend">Classification rationale</legend>
          <textarea
            class="textarea w-full"
            rows={2}
            data-ja-rationale
            oninput="updateJobAnalysis()"
          >
            {analysis.classification.rationale}
          </textarea>
        </label>
      </section>

      <section>
        <p class="mb-2 text-sm font-medium">Functional emphasis (must total exactly 100)</p>
        <div class="grid gap-3 sm:grid-cols-5">
          {emphasisFields.map(([key, label]) => (
            <label class="fieldset">
              <legend class="fieldset-legend text-xs">{label}</legend>
              <input
                type="number"
                class="input input-sm w-full"
                min={0}
                max={100}
                data-ja-fe={key}
                value={emphasis[key]}
                oninput="updateJobAnalysis()"
              />
            </label>
          ))}
        </div>
        <p class="mt-1 text-xs text-base-content/60" data-ja-fe-total>
          Total: {Object.values(emphasis).reduce((sum, value) => sum + value, 0)}
        </p>
      </section>

      <section>
        <p class="mb-2 text-sm font-medium">Requirements (ordered)</p>
        <div class="space-y-3">
          {analysis.requirements.map((requirement, index) => (
            <div data-ja-requirement class="rounded-box border border-base-300 bg-base-100 p-3">
              <div class="flex flex-wrap items-center gap-2">
                <span class="badge badge-outline badge-sm">#{index + 1}</span>
                {requirement.basis === 'inferred' ? (
                  <span class="badge badge-warning badge-sm">Inferred</span>
                ) : (
                  <span class="badge badge-neutral badge-sm">Explicit</span>
                )}
                <select class="select select-xs" data-ja-type onchange="updateJobAnalysis()">
                  {requirementTypes.map((type) => (
                    <option value={type} selected={requirement.type === type}>
                      {type}
                    </option>
                  ))}
                </select>
                <select class="select select-xs" data-ja-importance onchange="updateJobAnalysis()">
                  {requirementImportances.map((importance) => (
                    <option value={importance} selected={requirement.importance === importance}>
                      {importance}
                    </option>
                  ))}
                </select>
              </div>
              <input type="hidden" data-ja-basis value={requirement.basis} />
              <input type="hidden" data-ja-source value={requirement.sourceText} />
              <textarea
                class="textarea textarea-sm mt-2 w-full"
                rows={2}
                data-ja-statement
                oninput="updateJobAnalysis()"
              >
                {requirement.statement}
              </textarea>
              <p class="mt-1 text-xs italic text-base-content/60">
                Source: “{requirement.sourceText}”
              </p>
              {requirement.basis === 'inferred' && (
                <input
                  class="input input-sm mt-2 w-full"
                  placeholder="Inference rationale (required for inferred requirements)"
                  data-ja-inference
                  value={requirement.inferenceRationale ?? ''}
                  oninput="updateJobAnalysis()"
                />
              )}
              <div class="mt-2 space-y-2">
                <p class="text-xs font-medium">Skill terms stated by this requirement</p>
                <input type="hidden" data-ja-terms value={JSON.stringify(requirement.terms)} />
                {requirement.terms.length === 0 ? (
                  <p class="text-xs text-base-content/50">No specific skill terms.</p>
                ) : (
                  <ul class="flex flex-wrap gap-2">
                    {requirement.terms.map((term) => (
                      <li class="badge badge-outline badge-sm gap-1" data-ja-term>
                        <span data-ja-term-value>{term.term}</span>
                        {typeof term.confidence === 'number' ? (
                          <span class="opacity-60">{term.confidence}</span>
                        ) : null}
                        {term.key ? (
                          <span class="opacity-60" data-ja-term-key>
                            {term.key}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
                <p class="text-xs text-base-content/60">
                  These stay raw terms until you map or skip them in Review. The server only maps an
                  exact catalog key, curated alias or verified catalog match.
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {listSections.map(([key, label, attribute]) => (
        <section>
          <p class="mb-2 text-sm font-medium">{label}</p>
          <div class="space-y-2">
            {analysis[key].map((item) => (
              <input
                class="input input-sm w-full"
                {...{ [attribute]: true }}
                value={item}
                oninput="updateJobAnalysis()"
              />
            ))}
            {analysis[key].length === 0 && (
              <p class="text-xs text-base-content/50">None recorded.</p>
            )}
          </div>
        </section>
      ))}

      <section>
        <p class="mb-2 text-sm font-medium">Additional facts</p>
        <textarea
          class="textarea textarea-sm w-full"
          rows={2}
          data-ja-notes
          oninput="updateJobAnalysis()"
        >
          {analysis.notes ?? ''}
        </textarea>
      </section>

      <section>
        <p class="mb-2 text-sm font-medium">Interview questions</p>
        <div class="space-y-2">
          {analysis.interviewQuestions.map((question) => (
            <input
              class="input input-sm w-full"
              data-ja-interview
              value={question}
              oninput="updateJobAnalysis()"
            />
          ))}
        </div>
      </section>

      <textarea name="jobAnalysis" class="hidden">
        {JSON.stringify(analysis)}
      </textarea>
    </div>
  )
}
