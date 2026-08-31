import type { ApplicationAnalysisRun } from '../../../src/db/analysis'
import type { JobRequirement } from '../../../src/db/job-analysis'
import { parseStoredCandidateFit } from '../../../src/lib/candidate-fit-result'

function parseResult(run: ApplicationAnalysisRun | null) {
  return parseStoredCandidateFit(run?.resultJson ?? null)
}

const statusBadge = {
  direct: 'badge-success',
  transferable: 'badge-warning',
  'unknown-evidence': 'badge-neutral',
} as const
const statusLabel = {
  direct: 'Direct',
  transferable: 'Transferable',
  'unknown-evidence': 'Unverified',
} as const

export function RequirementEvidenceMatrix({
  run,
  requirements,
  oob = false,
}: {
  run: ApplicationAnalysisRun | null
  requirements: JobRequirement[]
  oob?: boolean
}) {
  const result = parseResult(run)
  const assessments = new Map(
    (result?.requirementAssessments ?? []).map((assessment) => [
      assessment.jobRequirementId,
      assessment,
    ]),
  )
  return (
    <section
      id="requirement-evidence-matrix"
      class="rounded-box border border-base-300 p-4"
      aria-live="polite"
      {...(oob ? { 'hx-swap-oob': 'outerHTML' } : {})}
    >
      <h3 class="font-semibold">Requirement evidence matrix</h3>
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
                <th>Importance</th>
                <th>Source excerpt</th>
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
                    <td class="text-base-content/70">{requirement.importance}</td>
                    <td class="min-w-40 max-w-64 text-xs italic text-base-content/60">
                      {requirement.sourceText ?? '—'}
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
                        <span class={`badge ${statusBadge[assessment.evidenceStatus]}`}>
                          {statusLabel[assessment.evidenceStatus]}
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
