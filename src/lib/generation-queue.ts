import { type Job, Queue, Worker } from 'bunqueue/client'
import {
  completeGenerationRun,
  createGenerationRun,
  failGenerationRun,
  getGenerationRun,
  listQueuedGenerationRuns,
  markGenerationRunProcessing,
} from '../db/generation'
import { generateApplicationArtifacts } from './generation'

type GenerationQueueJob = { runId: number }

const queueName = 'application-generation'
const queueDataPath = () =>
  process.env.QUEUE_FILE_NAME ??
  process.env.BUNQUEUE_DATA_PATH ??
  `${process.cwd().endsWith('/dist') ? '../' : ''}bunqueue.db`

let queue: Queue<GenerationQueueJob> | undefined
let worker: Worker<GenerationQueueJob, { runId: number }> | undefined

function getQueue() {
  queue ??= new Queue<GenerationQueueJob>(queueName, {
    embedded: true,
    dataPath: queueDataPath(),
    defaultJobOptions: { attempts: 3, backoff: 10_000, timeout: 180_000, durable: true },
  })
  return queue
}

async function processGeneration(job: Job<GenerationQueueJob>) {
  const run = getGenerationRun(job.data.runId)
  if (!run) return { runId: job.data.runId }
  if (run.status === 'Completed') return { runId: run.id }
  markGenerationRunProcessing(run.id)
  await job.updateProgress(10, 'Preparing structured job context')
  try {
    const artifacts = await generateApplicationArtifacts(run.id)
    await job.updateProgress(95, 'Saving generated documents')
    completeGenerationRun(run.id, artifacts)
    await job.updateProgress(100, 'Complete')
    return { runId: run.id }
  } catch (error) {
    failGenerationRun(run.id, error)
    throw error
  }
}

export function startGenerationWorker() {
  if (worker) return worker
  worker = new Worker<GenerationQueueJob, { runId: number }>(queueName, processGeneration, {
    embedded: true,
    dataPath: queueDataPath(),
    concurrency: 1,
    heartbeatInterval: 10_000,
  })
  worker.on('error', (error) => console.error('Generation worker error', error))
  return worker
}

export async function enqueueGeneration(jobApplicationId: number) {
  const run = createGenerationRun(jobApplicationId)
  if (!run) return null
  await getQueue().add(
    'generate-documents',
    { runId: run.id },
    { jobId: run.queueJobId, durable: true },
  )
  return run
}

export async function recoverQueuedGenerationRuns() {
  const queued = listQueuedGenerationRuns()
  for (const run of queued)
    await getQueue().add(
      'generate-documents',
      { runId: run.id },
      { jobId: run.queueJobId, durable: true },
    )
}
