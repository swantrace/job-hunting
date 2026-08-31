import { createRoute } from 'honox/factory'
import { getApplication } from '../../../../src/db/queries'
import { loadReviewData } from '../../../../src/db/review-data'
import { enqueueCandidateAnalysis } from '../../../../src/lib/analysis-queue'
import { getApplicationReadiness } from '../../../../src/lib/application-readiness'
import { careerSkillEvidenceMap } from '../../../../src/lib/career-data'
import { parseFilters, parseId } from '../../../../src/lib/request'
import { FitRecommendation } from '../../../components/workspace/FitRecommendation'
import { query } from '../../../components/workspace/helpers'
import { ProfileRecommendation } from '../../../components/workspace/ProfileRecommendation'
import { RequirementEvidenceMatrix } from '../../../components/workspace/RequirementEvidenceMatrix'
import { ReviewReadiness } from '../../../components/workspace/ReviewReadiness'
import { SkillGapPanel } from '../../../components/workspace/SkillGapPanel'

function hasCurrentJobAnalysis(jobId: number) {
  return loadReviewData(jobId).jobAnalysisCurrent
}

function statusFragment(jobId: number, filters: ReturnType<typeof parseFilters>) {
  const job = getApplication(jobId)
  if (!job) return <div class="alert alert-error">Application not found.</div>
  const review = loadReviewData(jobId)
  const run = review.run
  const shouldPoll = run?.status === 'Queued' || run?.status === 'Processing'
  const statusClass =
    run?.status === 'Completed'
      ? 'badge-success'
      : run?.status === 'Failed'
        ? 'badge-error'
        : run?.status === 'Processing'
          ? 'badge-warning'
          : 'badge-info'
  return (
    <>
      <section
        id="analysis-run-status"
        class="rounded-box border border-base-300 p-4"
        aria-live="polite"
        hx-get={
          shouldPoll
            ? `/applications/${jobId}/analysis-runs?${query(filters)}&workspaceTab=review`
            : undefined
        }
        hx-trigger={shouldPoll ? 'every 2s' : undefined}
        hx-swap={shouldPoll ? 'outerHTML' : undefined}
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="font-semibold">Candidate analysis</h3>
            <p class="text-sm text-base-content/60">
              Review the structured job analysis against your canonical career data.
            </p>
          </div>
          <form
            hx-post={`/applications/${jobId}/analysis-runs?${query(filters)}&workspaceTab=review`}
            hx-target="#analysis-run-status"
            hx-swap="outerHTML"
            hx-disabled-elt="find button"
          >
            <button class="btn btn-secondary btn-sm" disabled={!review.jobAnalysisCurrent}>
              <span class="loading loading-spinner loading-xs htmx-indicator" />
              {run?.status === 'Failed'
                ? 'Re-analyze'
                : run
                  ? 'Re-run analysis'
                  : 'Analyze candidate'}
            </button>
          </form>
        </div>
        {!review.jobAnalysisCurrent ? (
          <div class="alert alert-warning mt-4 text-sm" role="alert">
            <span>Analyze the job post first before running candidate analysis.</span>
          </div>
        ) : null}
        {run ? (
          <div class="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <span class={`badge ${statusClass}`}>{run.status}</span>
            {shouldPoll ? (
              <span class="loading loading-spinner loading-xs" aria-hidden="true" />
            ) : null}
            <span class="text-base-content/60">Attempts: {run.attempts}</span>
          </div>
        ) : (
          <p class="mt-3 text-sm text-base-content/60">No candidate analysis has been run yet.</p>
        )}
        {run?.errorMessage ? (
          <div class="alert alert-error mt-3 text-sm">
            <span>{run.errorMessage}</span>
          </div>
        ) : null}
      </section>
      {run?.status === 'Completed' ? (
        <>
          <FitRecommendation run={run} oob />
          <RequirementEvidenceMatrix run={run} requirements={review.requirements} oob />
          <ProfileRecommendation
            jobId={jobId}
            filters={filters}
            run={run}
            profiles={review.profiles}
            oob
          />
          <SkillGapPanel
            job={job}
            filters={filters}
            requirements={review.requirementSkills}
            careerEvidence={careerSkillEvidenceMap()}
            canDecide={review.state.state === 'current' && !!review.state.currentCompleted}
            oob
          />
          <ReviewReadiness
            jobId={jobId}
            filters={filters}
            readiness={getApplicationReadiness(jobId)}
            oob
          />
        </>
      ) : null}
    </>
  )
}

export const POST = createRoute(async (c) => {
  const id = parseId(c.req.param('id'))
  const filters = parseFilters(c)
  if (!id) return c.html(<div class="alert alert-error">Application not found.</div>, 404)
  if (!getApplication(id))
    return c.html(<div class="alert alert-error">Application not found.</div>, 404)

  if (!hasCurrentJobAnalysis(id)) {
    c.header('HX-Retarget', '#analysis-run-status')
    return c.html(statusFragment(id, filters), 422)
  }

  const result = await enqueueCandidateAnalysis(id)
  if (result.reason === 'missing-analysis') {
    c.header('HX-Retarget', '#analysis-run-status')
    return c.html(statusFragment(id, filters), 422)
  }
  return c.html(statusFragment(id, filters))
})

export const GET = createRoute((c) => {
  const id = parseId(c.req.param('id'))
  const filters = parseFilters(c)
  if (!id) return c.html(<div class="alert alert-error">Application not found.</div>, 404)
  return c.html(statusFragment(id, filters))
})
