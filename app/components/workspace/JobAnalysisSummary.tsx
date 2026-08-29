import type { JobCardData } from '../../../src/db/queries'

function parseJson<T>(value: string | null): T | null {
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

type Emphasis = Record<string, number>

export function JobAnalysisSummary({ job }: { job: JobCardData }) {
  const analysis = job.jobPostingAnalysis
  if (!analysis?.schemaVersion) {
    return (
      <section id="job-analysis-summary" class="rounded-box border border-base-300 p-4">
        <h3 class="font-semibold">Job analysis</h3>
        <p class="mt-2 text-sm text-base-content/60">
          No structured job analysis yet. Analyze the job post first.
        </p>
      </section>
    )
  }
  const summary = parseJson<{ rolePurpose?: string; idealCandidate?: string }>(analysis.summary)
  const emphasis = parseJson<Emphasis>(analysis.functionalEmphasisJson)
  return (
    <section id="job-analysis-summary" class="rounded-box border border-base-300 p-4">
      <h3 class="font-semibold">Job analysis</h3>
      <div class="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span class="badge badge-neutral">{analysis.roleType ?? 'unknown role type'}</span>
        <span class="badge badge-outline">
          Advertised: {analysis.advertisedSeniority ?? 'unknown'}
        </span>
        <span class="badge badge-outline">
          Practical: {analysis.practicalSeniority ?? 'unknown'}
        </span>
      </div>
      {summary?.rolePurpose ? (
        <p class="mt-3 text-sm text-base-content/70">{summary.rolePurpose}</p>
      ) : null}
      {analysis.classificationRationale ? (
        <p class="mt-2 text-xs text-base-content/60">{analysis.classificationRationale}</p>
      ) : null}
      {emphasis ? (
        <div class="mt-3 flex flex-wrap gap-1">
          {Object.entries(emphasis).map(([key, value]) => (
            <span class="badge badge-ghost badge-sm">
              {key}: {value}%
            </span>
          ))}
        </div>
      ) : null}
    </section>
  )
}
