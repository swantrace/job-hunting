import type { Queue, Worker } from 'bunqueue/client'
import {
  completeGenerationRun,
  createGenerationRun,
  failGenerationRun,
  getGenerationRun,
  getGenerationSource,
  listGenerationRuns,
  listQueuedGenerationRuns,
  markArtifactUploadFailed,
  markGenerationRunProcessing,
} from '../db/generation'

type GenerationQueueJob = { runId: number }

const queueName = 'application-generation'
const queueDataPath = () =>
  process.env.QUEUE_FILE_NAME ??
  process.env.BUNQUEUE_DATA_PATH ??
  `${process.cwd().endsWith('/dist') ? '../' : ''}bunqueue.db`

let queue: Queue<GenerationQueueJob> | undefined
let worker: Worker<GenerationQueueJob, { runId: number }> | undefined
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
  queue ??= new bunQueue.Queue<GenerationQueueJob>(queueName, {
    embedded: true,
    dataPath: queueDataPath(),
    defaultJobOptions: { attempts: 3, backoff: 10_000, timeout: 180_000, durable: true },
  })
  return queue
}

async function processGeneration(
  runId: number,
  updateProgress: (progress: number, message: string) => Promise<unknown>,
) {
  const run = getGenerationRun(runId)
  if (!run) return { runId }
  if (run.status === 'Completed') return { runId: run.id }
  markGenerationRunProcessing(run.id)
  await updateProgress(10, 'Preparing structured job context')
  try {
    const source = getGenerationSource(run.id)
    if (!source) throw new Error('Generation source no longer exists.')
    const { persistEvidenceSelectionSnapshot } = await import('./evidence-selection')
    await persistEvidenceSelectionSnapshot(source)
    const { generateApplicationArtifacts } = await import('./generation')
    const artifacts = await generateApplicationArtifacts(run.id)
    await updateProgress(95, 'Saving generated documents')
    completeGenerationRun(run.id, artifacts)
    const { uploadArtifactToGoogleDrive } = await import('./google-drive')
    const savedArtifacts =
      listGenerationRuns(run.jobApplicationId).find((item) => item.id === run.id)?.artifacts ?? []
    for (const artifact of savedArtifacts) {
      try {
        await uploadArtifactToGoogleDrive(artifact)
      } catch (error) {
        if (error instanceof Error && error.message === 'Google Drive is not connected.') continue
        markArtifactUploadFailed(artifact.id, error)
        console.error('Google Drive upload failed', error)
      }
    }
    await updateProgress(100, 'Complete')
    return { runId: run.id }
  } catch (error) {
    failGenerationRun(run.id, error)
    throw error
  }
}

export async function startGenerationWorker() {
  if (worker || !usePersistentQueue()) return worker
  const bunQueue = await getBunQueue()
  if (!bunQueue) return undefined
  worker = new bunQueue.Worker<GenerationQueueJob, { runId: number }>(
    queueName,
    (job) =>
      processGeneration(job.data.runId, (progress, message) =>
        job.updateProgress(progress, message),
      ),
    {
      embedded: true,
      dataPath: queueDataPath(),
      concurrency: 1,
      heartbeatInterval: 10_000,
    },
  )
  worker.on('error', (error) => console.error('Generation worker error', error))
  return worker
}

export async function enqueueGeneration(jobApplicationId: number) {
  const run = createGenerationRun(jobApplicationId)
  if (!run) return null
  const persistentQueue = await getQueue()
  if (!persistentQueue) {
    void processGeneration(run.id, async () => undefined).catch((error) =>
      console.error('Development document generation failed', error),
    )
    return run
  }
  await persistentQueue.add(
    'generate-documents',
    { runId: run.id },
    { jobId: run.queueJobId, durable: true },
  )
  return run
}

export async function recoverQueuedGenerationRuns() {
  const queued = listQueuedGenerationRuns()
  const persistentQueue = await getQueue()
  for (const run of queued) {
    if (!persistentQueue) {
      void processGeneration(run.id, async () => undefined).catch((error) =>
        console.error('Development document generation recovery failed', error),
      )
      continue
    }
    await persistentQueue.add(
      'generate-documents',
      { runId: run.id },
      { jobId: run.queueJobId, durable: true },
    )
  }
}
