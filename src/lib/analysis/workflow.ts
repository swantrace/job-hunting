import type { Engine, Execution } from 'bunqueue/workflow'
import {
  failAnalysisRun,
  getAnalysisRun,
  resetStaleProcessingAnalysisRuns,
} from '../../db/analysis'
import {
  assertWorkflowPosting,
  getAnalysisWorkflow,
  pendingAnalysisWorkflows,
  projectAnalysisWorkflow,
  updateAnalysisWorkflow,
} from '../../db/analysis-workflows'
import { db } from '../../db/client'
import {
  failJobAnalysisRun,
  getJobAnalysisRun,
  getJobAnalysisState,
  resetStaleProcessingJobAnalysisRuns,
} from '../../db/job-analysis-runs'
import { currentJobAnalysisHash } from '../job-analysis/input'
import { executeJobAnalysis, prepareJobAnalysisRun } from '../job-analysis/queue'
import { executeCandidateAnalysis, prepareCandidateAnalysisRun } from './queue'

export const analysisWorkflowName = 'application-analysis-v1'
export const analysisQueuePath = () =>
  process.env.QUEUE_FILE_NAME ??
  process.env.BUNQUEUE_DATA_PATH ??
  `${process.cwd().endsWith('/dist') ? '../' : ''}bunqueue.db`

export type AnalysisProcessors = {
  job: (id: number, signal?: AbortSignal) => Promise<void>
  candidate: (id: number, signal?: AbortSignal) => Promise<void>
}
const processors: AnalysisProcessors = {
  job: executeJobAnalysis,
  candidate: executeCandidateAnalysis,
}
type AnalysisRuntime = {
  engine?: Engine
  initializing?: Promise<Engine>
  dispatching?: Promise<void>
  running: Map<string, Promise<void>>
  recoveryTimer?: ReturnType<typeof setInterval>
  recovering: boolean
}
// Vite can re-evaluate server modules without restarting Bun. Keep one owner:
// resetting Processing while an old Engine is live could duplicate paid calls.
const scope = globalThis as typeof globalThis & { __jobTrackerAnalysis?: AnalysisRuntime }
export const analysisRuntime: AnalysisRuntime = (scope.__jobTrackerAnalysis ??= {
  running: new Map(),
  recovering: false,
})
// A reused business run can be referenced by multiple workflows. Only its owner
// executes; other steps await the same outcome, never treat Processing as success.
const running = analysisRuntime.running
async function executeOnce(key: string, execute: () => Promise<void>) {
  const existing = running.get(key)
  if (existing) return existing
  const work = Promise.resolve().then(execute)
  running.set(key, work)
  try {
    await work
  } finally {
    running.delete(key)
  }
}

export async function createAnalysisWorkflowDefinition(run: AnalysisProcessors = processors) {
  const { Workflow } = await import('bunqueue/workflow')
  return new Workflow<{ requestId: number }>(analysisWorkflowName)
    .step(
      'job-analysis',
      async ({ input, signal }) => {
        let request = assertWorkflowPosting(input.requestId)
        if (!request.jobAnalysisRunId) {
          if (request.mode === 'candidate-only')
            throw new Error('A current completed Job Post analysis is required.')
          db.transaction(() => {
            const prepared = prepareJobAnalysisRun(request.jobPostingId!)
            if (!prepared.run) throw new Error('Job posting no longer exists.')
            updateAnalysisWorkflow(request.id, { jobAnalysisRunId: prepared.run.id })
          })
          request = getAnalysisWorkflow(request.id)!
        }
        if (request.mode === 'job-and-candidate') {
          projectAnalysisWorkflow(request.id, 'job-analysis')
          const previous = getJobAnalysisRun(db, request.jobAnalysisRunId!)
          if (previous?.status === 'Failed')
            throw new Error(previous.errorMessage ?? 'Job analysis failed. Retry explicitly.')
          if (getJobAnalysisRun(db, request.jobAnalysisRunId!)?.status !== 'Completed')
            await executeOnce(`job:${request.jobAnalysisRunId}`, () =>
              run.job(request.jobAnalysisRunId!, signal),
            )
        }
        signal?.throwIfAborted()
        const job = getJobAnalysisRun(db, request.jobAnalysisRunId!)
        if (job?.status !== 'Completed')
          throw new Error(job?.errorMessage ?? 'Job analysis did not complete.')
        return job.id
      },
      // A bounded retry budget permits crash-resume. Persisted Failed business
      // runs are rejected above, so these retries cannot repeat a known failure.
      { retry: 3, timeout: 900_000 },
    )
    .step(
      'candidate-analysis',
      async ({ input, steps, signal }) => {
        let request = assertWorkflowPosting(input.requestId)
        const jobState = getJobAnalysisState(
          db,
          request.jobPostingId!,
          currentJobAnalysisHash(db, request.jobPostingId!),
        )
        if (jobState.currentCompleted?.id !== steps['job-analysis'])
          throw new Error(
            'Job Post analysis changed while this workflow was running. Analyze again.',
          )
        if (!request.candidateAnalysisRunId) {
          db.transaction(() => {
            const prepared = prepareCandidateAnalysisRun(
              request.jobApplicationId!,
              steps['job-analysis'],
            )
            if (!prepared.run) throw new Error('Candidate analysis could not be prepared.')
            updateAnalysisWorkflow(request.id, { candidateAnalysisRunId: prepared.run.id })
          })
          request = getAnalysisWorkflow(request.id)!
        }
        projectAnalysisWorkflow(request.id, 'candidate-analysis')
        const previous = getAnalysisRun(request.candidateAnalysisRunId!)
        if (previous?.status === 'Failed')
          throw new Error(previous.errorMessage ?? 'Candidate analysis failed. Retry explicitly.')
        if (getAnalysisRun(request.candidateAnalysisRunId!)?.status !== 'Completed')
          await executeOnce(`candidate:${request.candidateAnalysisRunId}`, () =>
            run.candidate(request.candidateAnalysisRunId!, signal),
          )
        signal?.throwIfAborted()
        const candidate = getAnalysisRun(request.candidateAnalysisRunId!)
        if (candidate?.status !== 'Completed')
          throw new Error(candidate?.errorMessage ?? 'Candidate analysis did not complete.')
        if (candidate.jobPostingAnalysisId !== steps['job-analysis'])
          throw new Error('Candidate analysis references a different Job Analysis.')
        assertWorkflowPosting(request.id)
        projectAnalysisWorkflow(request.id, 'completed')
        return candidate.id
      },
      { retry: 3, timeout: 900_000 },
    )
}

/** Repair projections after a crash between the two SQLite commits. */
function reconcileExecution(execution: Execution) {
  const requestId = (execution.input as { requestId?: number })?.requestId
  if (!requestId) return
  const request = getAnalysisWorkflow(requestId)
  if (!request || (request.executionId && request.executionId !== execution.id)) return
  if (!request.executionId) updateAnalysisWorkflow(requestId, { executionId: execution.id })
  if (execution.state === 'failed' && request.status !== 'Failed') {
    const error = new Error(execution.failureReason ?? 'Analysis workflow failed.')
    if (request.jobAnalysisRunId && !running.has(`job:${request.jobAnalysisRunId}`)) {
      const job = getJobAnalysisRun(db, request.jobAnalysisRunId)
      if (job && ['Queued', 'Processing'].includes(job.status))
        failJobAnalysisRun(db, job.id, error)
    }
    if (
      request.candidateAnalysisRunId &&
      !running.has(`candidate:${request.candidateAnalysisRunId}`)
    ) {
      const candidate = getAnalysisRun(request.candidateAnalysisRunId)
      if (candidate && ['Queued', 'Processing'].includes(candidate.status))
        failAnalysisRun(candidate.id, error)
    }
    projectAnalysisWorkflow(requestId, 'failed', error)
  }
  if (execution.state === 'completed' && request.status !== 'Completed') {
    const candidate =
      request.candidateAnalysisRunId && getAnalysisRun(request.candidateAnalysisRunId)
    if (candidate && candidate.status === 'Completed')
      projectAnalysisWorkflow(requestId, 'completed')
    else
      projectAnalysisWorkflow(
        requestId,
        'failed',
        new Error('Completed workflow has no completed Candidate Analysis. Retry explicitly.'),
      )
  }
}

export async function getAnalysisEngine(run: AnalysisProcessors = processors) {
  analysisRuntime.initializing ??= (async () => {
    const { Engine } = await import('bunqueue/workflow')
    // One embedded owner per process. On boot there are no surviving model calls.
    resetStaleProcessingJobAnalysisRuns(db)
    resetStaleProcessingAnalysisRuns()
    const engine = new Engine({ embedded: true, dataPath: analysisQueuePath(), concurrency: 3 })
    analysisRuntime.engine = engine
    engine.register(await createAnalysisWorkflowDefinition(run))
    engine.onAny((event) => {
      if (!['workflow:started', 'workflow:completed', 'workflow:failed'].includes(event.type))
        return
      const execution = engine?.getExecution(event.executionId)
      if (execution?.workflowName === analysisWorkflowName) reconcileExecution(execution)
    })
    // Adopt the narrow crash window after engine persistence but before recording
    // its ID in jobs.db. Pagination includes terminal executions for projection repair.
    for (let offset = 0; ; offset += 1000) {
      const executions = engine.listExecutions(analysisWorkflowName, undefined, {
        limit: 1000,
        offset,
      })
      for (const execution of executions) reconcileExecution(execution)
      if (executions.length < 1000) break
    }
    await engine.recover()
    return engine
  })().catch(async (error) => {
    await analysisRuntime.engine?.close(true)
    analysisRuntime.engine = undefined
    analysisRuntime.initializing = undefined
    throw error
  })
  return analysisRuntime.initializing
}

/** Outbox delivery only: the Engine, not this scan, advances analysis steps. */
export function dispatchAnalysisWorkflows() {
  analysisRuntime.dispatching ??= (async () => {
    if (!pendingAnalysisWorkflows().length) return
    const current = await getAnalysisEngine()
    for (const request of pendingAnalysisWorkflows()) {
      const existing = request.executionId ? current.getExecution(request.executionId) : null
      if (existing) {
        reconcileExecution(existing)
        continue
      }
      try {
        const execution = await current.start(analysisWorkflowName, { requestId: request.id })
        updateAnalysisWorkflow(request.id, { executionId: execution.id })
      } catch (error) {
        // No new run/snapshot is created on an enqueue retry.
        updateAnalysisWorkflow(request.id, { executionId: null })
        console.error('Analysis workflow dispatch deferred', request.id, error)
      }
    }
  })().finally(() => {
    analysisRuntime.dispatching = undefined
  })
  return analysisRuntime.dispatching
}

export async function closeAnalysisEngine() {
  await analysisRuntime.engine?.close()
  analysisRuntime.engine = undefined
  analysisRuntime.initializing = undefined
}
