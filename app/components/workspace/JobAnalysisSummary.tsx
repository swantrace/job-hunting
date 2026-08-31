import type { JobAnalysisRun } from '../../../src/db/job-analysis-runs'
import { parseJobAnalysisResult } from '../../../src/lib/job-analysis-result'

export function JobAnalysisSummary({
  analysis,
  oob = false,
}: {
  analysis: JobAnalysisRun | null
  oob?: boolean
}) {
  const result = parseJobAnalysisResult(analysis?.resultJson ?? null)
  if (!analysis?.schemaVersion || !result) {
    return (
      <section
        id="job-analysis-summary"
        class="rounded-box border border-base-300 p-4"
        {...(oob ? { 'hx-swap-oob': 'outerHTML' } : {})}
      >
        <h3 class="font-semibold">Job analysis</h3>
        <p class="mt-2 text-sm text-base-content/60">
          No structured job analysis yet. Analyze the job post first.
        </p>
      </section>
    )
  }
  const classification = result.classification
  return (
    <section
      id="job-analysis-summary"
      class="rounded-box border border-base-300 p-4"
      {...(oob ? { 'hx-swap-oob': 'outerHTML' } : {})}
    >
      <h3 class="font-semibold">Job analysis</h3>
      <div class="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span class="badge badge-neutral">{classification.roleType}</span>
        <span class="badge badge-outline">Advertised: {classification.advertisedSeniority}</span>
        <span class="badge badge-outline">Practical: {classification.practicalSeniority}</span>
      </div>
      {result.summary.rolePurpose ? (
        <p class="mt-3 text-sm text-base-content/70">{result.summary.rolePurpose}</p>
      ) : null}
      {classification.rationale ? (
        <p class="mt-2 text-xs text-base-content/60">{classification.rationale}</p>
      ) : null}
      <div class="mt-3 flex flex-wrap gap-1">
        {Object.entries(classification.functionalEmphasis).map(([key, value]) => (
          <span class="badge badge-ghost badge-sm">
            {key}: {value}%
          </span>
        ))}
      </div>
    </section>
  )
}
