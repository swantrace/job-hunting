import type { ApplicationAnalysisRun } from '../../../src/db/analysis'
import type { JobRequirement } from '../../../src/db/job-analysis'
import {
  evidenceStatusBadges,
  evidenceStatusLabels,
  parseCandidateFitResult,
} from '../../../src/lib/evidence/status'
import { requirementCoverageFromAssessments } from '../../../src/lib/requirements/score'

function percentage(value: number | null) {
  return value === null ? 'Not enough requirements' : `${value.toFixed(1)}%`
}

export function RequirementEvidenceMatrix({
  run,
  requirements,
  oob = false,
}: {
  run: ApplicationAnalysisRun | null
  requirements: JobRequirement[]
  oob?: boolean
}) {
  const result = parseCandidateFitResult(run?.resultJson)
  const assessments = new Map(
    (result?.requirementAssessments ?? []).map((assessment) => [
      assessment.jobRequirementId,
      assessment,
    ]),
  )
  const importanceById = new Map(
    requirements.map((requirement) => [requirement.id, requirement.importance]),
  )
  const coverage = result
    ? requirementCoverageFromAssessments(result.requirementAssessments, importanceById)
    : null
  return (
    <section
      id="requirement-evidence-matrix"
      class="rounded-box border border-base-300 p-4"
      aria-live="polite"
      {...(oob ? { 'hx-swap-oob': 'outerHTML' } : {})}
    >
      <h3 class="font-semibold">Requirement evidence matrix</h3>
      {coverage ? (
        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <div class="rounded-box border border-base-300 p-3">
            <p class="text-sm font-medium">Direct evidence coverage</p>
            <p class="text-lg font-bold">{percentage(coverage.directCoverage.percentage)}</p>
            <p class="text-xs text-base-content/60">
              {coverage.directCoverage.matchedWeight}/{coverage.directCoverage.totalWeight} weighted
              requirements
            </p>
          </div>
          <div class="rounded-box border border-base-300 p-3">
            <p class="text-sm font-medium">Supported evidence coverage</p>
            <p class="text-lg font-bold">{percentage(coverage.supportedCoverage.percentage)}</p>
            <p class="text-xs text-base-content/60">
              {coverage.supportedCoverage.matchedWeight}/{coverage.supportedCoverage.totalWeight}{' '}
              weighted requirements
            </p>
          </div>
        </div>
      ) : null}
      {requirements.length === 0 ? (
        <p class="mt-2 text-sm text-base-content/60">
          No structured requirements are available for this application.
        </p>
      ) : (
        <div class="mt-3 overflow-x-auto">
          <table class="table table-sm">
            <caption class="sr-only">Requirement-to-evidence mapping</caption>
            <thead>
              <tr>
                <th>#</th>
                <th>Requirement</th>
                <th>Evidence</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {requirements.map((requirement) => {
                const assessment = assessments.get(requirement.id)
                return (
                  <tr>
                    <td class="text-base-content/60">{requirement.sequence}</td>
                    <td class="min-w-56">
                      <span class="font-medium">{requirement.statement}</span>
                      {requirement.basis === 'inferred' ? (
                        <span class="badge badge-warning badge-sm ml-2">Inferred</span>
                      ) : null}
                    </td>
                    <td class="min-w-40 text-base-content/70">
                      {assessment?.evidenceRefs.length
                        ? assessment.evidenceRefs
                            .map((ref) => `${ref.sourceType}:${ref.sourceId}`)
                            .join(', ')
                        : '—'}
                    </td>
                    <td>
                      {assessment ? (
                        <span class={`badge ${evidenceStatusBadges[assessment.evidenceStatus]}`}>
                          {evidenceStatusLabels[assessment.evidenceStatus]}
                        </span>
                      ) : (
                        <span class="badge badge-ghost shrink-0 text-nowrap">Not assessed</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
