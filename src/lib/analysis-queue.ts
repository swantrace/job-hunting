import type { Queue, Worker } from 'bunqueue/client'
import { candidateFitPromptVersion } from '../ai/prompts/candidate-fit'
import { jobAnalysisSchemaVersion } from '../ai/schemas/job-analysis'
import {
  completeAnalysisRun,
  createAnalysisRun,
  failAnalysisRun,
  findReusableAnalysisRun,
  getAnalysisRun,
  listQueuedAnalysisRuns,
  markAnalysisRunProcessing,
} from '../db/analysis'

type AnalysisQueueJob = { runId: number }

const queueName = 'candidate-analysis'
const queueDataPath = () =>
  process.env.QUEUE_FILE_NAME ??
  process.env.BUNQUEUE_DATA_PATH ??
  `${process.cwd().endsWith('/dist') ? '../' : ''}bunqueue.db`

let queue: Queue<AnalysisQueueJob> | undefined
let worker: Worker<AnalysisQueueJob, { runId: number }> | undefined
let bunQueueModule: Promise<typeof import('bunqueue/client')> | undefined

function usePersistentQueue() {
  return process.env.NODE_ENV === 'production'
}

async function getBunQueue() {
  if (!usePersistentQueue()) return null
  bunQueueModule ??= import('bunqueue/client')
  return bunQueueModule
}

async function getQueue() {
  const bunQueue = await getBunQueue()
  if (!bunQueue) return null
  queue ??= new bunQueue.Queue<AnalysisQueueJob>(queueName, {
    embedded: true,
    dataPath: queueDataPath(),
    defaultJobOptions: { attempts: 3, backoff: 10_000, timeout: 240_000, durable: true },
  })
  return queue
}

async function processAnalysis(
  runId: number,
  updateProgress: (progress: number, message: string) => Promise<unknown>,
) {
  const run = getAnalysisRun(runId)
  if (!run) return { runId }
  if (run.status === 'Completed') return { runId: run.id }
  markAnalysisRunProcessing(run.id)
  await updateProgress(10, 'Running candidate analysis')
  try {
    const { runCandidateAnalysis } = await import('./candidate-analysis')
    const result = await runCandidateAnalysis(run.id)
    completeAnalysisRun(
      run.id,
      JSON.stringify(result),
      result.profileRecommendation.recommendedProfileId,
    )
    await updateProgress(100, 'Complete')
    return { runId: run.id }
  } catch (error) {
    failAnalysisRun(run.id, error)
    throw error
  }
}

export async function startAnalysisWorker() {
  if (worker || !usePersistentQueue()) return worker
  const bunQueue = await getBunQueue()
  if (!bunQueue) return undefined
  worker = new bunQueue.Worker<AnalysisQueueJob, { runId: number }>(
    queueName,
    (job) =>
      processAnalysis(job.data.runId, (progress, message) => job.updateProgress(progress, message)),
    {
      embedded: true,
      dataPath: queueDataPath(),
      concurrency: 1,
      heartbeatInterval: 10_000,
    },
  )
  worker.on('error', (error) => console.error('Analysis worker error', error))
  return worker
}

export type EnqueueAnalysisResult =
  | { run: NonNullable<ReturnType<typeof getAnalysisRun>>; reused: boolean; reason?: undefined }
  | { run: null; reused: false; reason: 'missing-analysis' }

/**
 * Persists the frozen input and enqueues the run. A queued or processing run
 * with the same input hash is reused instead of creating a duplicate. New runs
 * are created when no completed result exists or the input has changed.
 */
export async function enqueueCandidateAnalysis(
  jobApplicationId: number,
): Promise<EnqueueAnalysisResult> {
  const { buildCandidateAnalysisInput } = await import('./candidate-analysis')
  const built = buildCandidateAnalysisInput(jobApplicationId)
  if (!built) return { run: null, reused: false, reason: 'missing-analysis' }

  const reusable = findReusableAnalysisRun(jobApplicationId, built.inputHash)
  if (reusable) return { run: reusable, reused: true }

  const model =
    process.env.OPENAI_MODEL_CANDIDATE_FIT ?? process.env.OPENAI_MODEL_DEFAULT ?? 'gpt-5-mini'
  const run = createAnalysisRun({
    jobApplicationId,
    inputHash: built.inputHash,
    inputSnapshotJson: JSON.stringify(built.snapshot),
    model,
    promptVersion: candidateFitPromptVersion,
    schemaVersion: jobAnalysisSchemaVersion,
  })

  const persistentQueue = await getQueue()
  if (!persistentQueue) {
    void processAnalysis(run.id, async () => undefined).catch((error) =>
      console.error('Development candidate analysis failed', error),
    )
    return { run, reused: false }
  }
  await persistentQueue.add(
    'analyze-candidate',
    { runId: run.id },
    { jobId: run.queueJobId, durable: true },
  )
  return { run, reused: false }
}

export async function recoverQueuedAnalysisRuns() {
  const queued = listQueuedAnalysisRuns()
  const persistentQueue = await getQueue()
  for (const run of queued) {
    if (!persistentQueue) {
      void processAnalysis(run.id, async () => undefined).catch((error) =>
        console.error('Development candidate analysis recovery failed', error),
      )
      continue
    }
    await persistentQueue.add(
      'analyze-candidate',
      { runId: run.id },
      { jobId: run.queueJobId, durable: true },
    )
  }
}
