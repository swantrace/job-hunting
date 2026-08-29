import type { Filters, JobCardData } from '../../../src/db/queries'
import { ApplicationForm } from './ApplicationForm'

export function ApplicationPanel({
  job,
  filters,
  active = false,
}: {
  job: JobCardData
  filters: Filters
  active?: boolean
}) {
  return (
    <div
      id="workspace-application-panel"
      role="tabpanel"
      aria-labelledby="workspace-tab-application"
      data-workspace-panel
      class={active ? '' : 'hidden'}
    >
      <ApplicationForm job={job} filters={filters} />
      {job.jobPosting && (
        <details class="mt-6 rounded-box border border-base-300 p-4">
          <summary class="cursor-pointer font-semibold">Saved job post</summary>
          <pre class="mt-3 max-h-96 overflow-auto whitespace-pre-wrap text-sm">
            {job.jobPosting.rawText}
          </pre>
        </details>
      )}
      {job.jobPostingAnalysis && <JobPostAnalysis analysis={job.jobPostingAnalysis} />}
    </div>
  )
}

function JobPostAnalysis({
  analysis,
}: {
  analysis: NonNullable<JobCardData['jobPostingAnalysis']>
}) {
  const fields = [
    ['Requirements', analysis.requirements],
    ['Responsibilities', analysis.responsibilities],
    ['Pain points', analysis.painPoints],
    ['Culture signals', analysis.culture],
    ['Red flags', analysis.redFlags],
    ['Success metrics', analysis.successMetrics],
    ['Benefits', analysis.benefits],
    ['Additional facts', analysis.notes],
  ] as const
  return (
    <details class="mt-4 rounded-box border border-base-300 p-4">
      <summary class="cursor-pointer font-semibold">AI job-post analysis</summary>
      <div class="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        {fields.map(([label, value]) =>
          value ? (
            <section>
              <h3 class="font-medium">{label}</h3>
              <p class="mt-1 whitespace-pre-wrap text-base-content/70">{value}</p>
            </section>
          ) : null,
        )}
      </div>
    </details>
  )
}
