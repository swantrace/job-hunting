import { createRoute } from 'honox/factory'
import {
  getGenerationEvidenceSnapshot,
  getGenerationState,
  getGoogleDriveConnection,
  listGenerationRuns,
} from '../../../../src/db/generation'
import type { Filters, JobCardData } from '../../../../src/db/queries'
import { getApplication } from '../../../../src/db/queries'
import {
  buildResumeStrategyDraft,
  getResumeStrategy,
  runEvidenceAllowlist,
  saveResumeStrategy,
} from '../../../../src/db/resume-strategy'
import { getApplicationReadiness } from '../../../../src/lib/application-readiness'
import { getCandidateAnalysisState } from '../../../../src/lib/candidate-analysis'
import { parseFilters, parseId } from '../../../../src/lib/request'
import { computeWorkspaceAvailability } from '../../../../src/lib/workspace/availability'
import { tabAvailability } from '../../../../src/lib/workspace/state'
import { GenerationPanel } from '../../../components/workspace/GenerationPanel'
import { ResumeStrategy } from '../../../components/workspace/ResumeStrategy'
import { ReviewReadiness } from '../../../components/workspace/ReviewReadiness'
import { WorkspaceTabs } from '../../../components/workspace/WorkspaceTabs'

function strategyFragment(
  job: JobCardData,
  filters: Filters,
  runId: number | null,
  error?: string,
) {
  const state = getCandidateAnalysisState(job.id)
  const run = runId ? (state.currentCompleted?.id === runId ? state.currentCompleted : null) : null
  const strategy = run ? getResumeStrategy(run.id) : null
  const draft = run ? buildResumeStrategyDraft(run.id) : null
  const allowlist = run ? [...runEvidenceAllowlist(run)].sort() : []
  const canEdit = !!run && !!run.confirmedProfileId
  return (
    <ResumeStrategy
      jobId={job.id}
      filters={filters}
      run={run}
      strategy={strategy}
      draft={draft}
      allowlist={allowlist}
      canEdit={canEdit}
      error={error}
    />
  )
}

function documentsAvailabilityFragment(job: JobCardData, filters: Filters) {
  const generationRuns = listGenerationRuns(job.id)
  const generationState = getGenerationState(job.id)
  const latestEvidenceSnapshot = generationRuns[0]
    ? getGenerationEvidenceSnapshot(generationRuns[0].id)
    : null
  const googleDriveConnected = !!getGoogleDriveConnection()
  return (
    <GenerationPanel
      jobId={job.id}
      filters={filters}
      runs={generationRuns}
      evidenceSnapshot={latestEvidenceSnapshot?.snapshotJson ?? null}
      googleDriveConnected={googleDriveConnected}
      readiness={getApplicationReadiness(job.id)}
      state={generationState}
      oob
    />
  )
}

export const POST = createRoute(async (c) => {
  const id = parseId(c.req.param('id'))
  const filters = parseFilters(c)
  const job = id ? getApplication(id) : null
  if (!id || !job) return c.html(<div class="alert alert-error">Application not found.</div>, 404)

  const current = getCandidateAnalysisState(id).currentCompleted
  if (!current) {
    c.header('HX-Retarget', '#resume-strategy')
    return c.html(strategyFragment(job, filters, null, 'No current candidate analysis run.'), 422)
  }

  const form = await c.req.formData()
  const runId = Number(form.get('runId'))
  if (runId !== current.id) {
    c.header('HX-Retarget', '#resume-strategy')
    return c.html(strategyFragment(job, filters, current.id, 'Candidate analysis is stale.'), 422)
  }

  const positioning = String(form.get('positioning') ?? '').trim()
  const primaryThemes = String(form.get('primaryThemes') ?? '')
    .split('\n')
    .map((theme) => theme.trim())
    .filter(Boolean)
  const emphasizeEvidenceIds = form.getAll('emphasizeEvidenceIds').map(String)
  const deemphasizeEvidenceIds = form.getAll('deemphasizeEvidenceIds').map(String)

  const result = saveResumeStrategy(id, runId, {
    positioning,
    primaryThemes,
    emphasizeEvidenceIds,
    deemphasizeEvidenceIds,
  })
  if (!result.ok) {
    c.header('HX-Retarget', '#resume-strategy')
    return c.html(strategyFragment(job, filters, runId, result.message), 422)
  }

  return c.html(
    <>
      {strategyFragment(job, filters, runId)}
      <ReviewReadiness jobId={id} filters={filters} readiness={getApplicationReadiness(id)} oob />
      <WorkspaceTabs
        activeTab="review"
        availability={tabAvailability(computeWorkspaceAvailability(id))}
        oob
      />
      {documentsAvailabilityFragment(job, filters)}
    </>,
  )
})

export const GET = createRoute((c) => {
  const id = parseId(c.req.param('id'))
  const filters = parseFilters(c)
  const job = id ? getApplication(id) : null
  if (!id || !job) return c.html(<div class="alert alert-error">Application not found.</div>, 404)
  const runId = getCandidateAnalysisState(id).currentCompleted?.id ?? null
  return c.html(strategyFragment(job, filters, runId))
})
