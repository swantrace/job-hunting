import type { Filters, JobCardData } from '../../../src/db/queries'
import type { RunSkillReview } from '../../../src/db/skill-queries'
import { calculateSkillScores } from '../../../src/lib/skills/score'
import { skillCategoryDefinitions, skillCategoryLabel } from '../../../src/lib/skills/taxonomy'
import { query } from './helpers'
import { SkillDecisionForm } from './SkillDecisionForm'

const importanceOrder = { required: 0, preferred: 1, mentioned: 2 } as const
function categoryLabel(category: string | 'uncategorized' | null) {
  return category && category !== 'uncategorized'
    ? (skillCategoryLabel(category) ?? category)
    : 'Uncategorized'
}

function groupRequirements(requirements: RunSkillReview[]) {
  const byCategory = new Map<string, RunSkillReview[]>()
  const categoryOrder = new Map(
    skillCategoryDefinitions().map((item) => [item.key, item.sortOrder]),
  )
  for (const requirement of requirements) {
    const key = requirement.category ?? 'uncategorized'
    const list = byCategory.get(key) ?? []
    list.push(requirement)
    byCategory.set(key, list)
  }
  return [...byCategory.entries()]
    .sort(([a], [b]) => {
      return (
        (categoryOrder.get(a) ?? Number.MAX_SAFE_INTEGER) -
        (categoryOrder.get(b) ?? Number.MAX_SAFE_INTEGER)
      )
    })
    .map(([category, items]) => ({
      category: category as string | 'uncategorized',
      items: [...items].sort(
        (a, b) => importanceOrder[a.importance] - importanceOrder[b.importance],
      ),
    }))
}

export function SkillGapPanel({
  job,
  filters,
  requirements,
  careerEvidence,
  canDecide = true,
}: {
  job: JobCardData
  filters: Filters
  requirements: RunSkillReview[]
  careerEvidence: Record<string, string[]>
  canDecide?: boolean
}) {
  const scores = calculateSkillScores(
    requirements.map((item) => ({
      analysisResult: item.analysisResult,
      importance: item.importance,
      userDecision: item.decision,
    })),
  )
  const pendingCount = requirements.filter(
    (item) => item.analysisResult === 'not-in-career-data' && item.decision === 'pending',
  ).length
  const groups = groupRequirements(requirements)

  return (
    <div id="skill-review-panel">
      <section class="mb-4 grid gap-3 sm:grid-cols-3">
        <div id="skill-readiness" class="rounded-box border border-base-300 p-3">
          <p class="text-sm font-medium">Readiness</p>
          <p class="text-lg font-bold">
            {pendingCount
              ? `${pendingCount} decision${pendingCount === 1 ? '' : 's'} pending`
              : 'Ready'}
          </p>
        </div>
        <div id="canonical-score" class="rounded-box border border-base-300 p-3">
          <p class="text-sm font-medium">Canonical match</p>
          <p class="text-lg font-bold">
            {scores.canonicalMatch.percentage === null
              ? 'Not enough requirements'
              : `${scores.canonicalMatch.percentage.toFixed(1)}%`}
          </p>
          <p class="text-xs text-base-content/60">
            {scores.canonicalMatch.matchedWeight}/{scores.canonicalMatch.totalWeight} weighted
          </p>
        </div>
        <div id="application-coverage" class="rounded-box border border-base-300 p-3">
          <p class="text-sm font-medium">Application coverage</p>
          <p class="text-lg font-bold">
            {scores.applicationCoverage.percentage === null
              ? 'Not enough requirements'
              : `${scores.applicationCoverage.percentage.toFixed(1)}%`}
          </p>
          <p class="text-xs text-base-content/60">
            {scores.applicationCoverage.matchedWeight}/{scores.applicationCoverage.totalWeight}{' '}
            weighted
          </p>
        </div>
      </section>

      {requirements.length === 0 ? (
        <p class="text-sm text-base-content/60">
          No structured skills have been saved for this application.
        </p>
      ) : (
        <>
          {pendingCount > 0 && (
            <form
              class="mb-4 flex justify-end"
              hx-post={`/applications/${job.id}/skill-decisions?${query(filters)}`}
              hx-target="#skill-review-panel"
              hx-swap="outerHTML"
              hx-confirm="Skip every remaining pending skill?"
            >
              <input type="hidden" name="action" value="skip-remaining" />
              <button class="btn btn-outline btn-sm" disabled={!canDecide}>
                Skip remaining
              </button>
            </form>
          )}
          <div class="space-y-5">
            {groups.map((group) => (
              <section>
                <h3 class="mb-2 font-semibold">{categoryLabel(group.category)}</h3>
                <ul class="space-y-2">
                  {group.items.map((requirement) => (
                    <li class="rounded-box border border-base-300 p-3">
                      <div class="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2">
                        <div class="col-start-1 row-start-1 min-w-0">
                          <p class="font-medium">{requirement.skillName}</p>
                          <p class="text-xs text-base-content/60">
                            Importance: {requirement.importance}
                            {requirement.rawLabel && requirement.rawLabel !== requirement.skillName
                              ? ` · from “${requirement.rawLabel}”`
                              : ''}
                          </p>
                          <p class="mt-1 text-xs italic text-base-content/60">
                            {requirement.requirementStatement}
                          </p>
                        </div>
                        {requirement.analysisResult === 'proven-match' ? (
                          <ProvenMatch
                            careerSkillId={requirement.careerSkillId}
                            evidence={
                              requirement.careerSkillId
                                ? (careerEvidence[requirement.careerSkillId] ?? [])
                                : []
                            }
                          />
                        ) : (
                          <SkillDecisionForm
                            job={job}
                            filters={filters}
                            requirement={requirement}
                            canDecide={canDecide}
                          />
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ProvenMatch({
  careerSkillId,
  evidence,
}: {
  careerSkillId: string | null
  evidence: string[]
}) {
  return (
    <div class="contents">
      <div class="col-start-2 row-start-1 self-start justify-self-end">
        <span class="badge badge-success whitespace-nowrap">Proven match</span>
      </div>
      {careerSkillId || evidence.length > 0 ? (
        <div class="col-span-2 row-start-2 space-y-1 text-left text-xs text-base-content/60">
          {careerSkillId && <p>Linked to career skill “{careerSkillId}”</p>}
          {evidence.length > 0 && <p>Evidence: {evidence.join(', ')}</p>}
        </div>
      ) : null}
    </div>
  )
}
