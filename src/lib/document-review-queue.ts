import type { Queue, Worker } from 'bunqueue/client'
import { documentReviewPromptVersion } from '../ai/prompts/document-review'
import { documentReviewSchemaVersion } from '../ai/schemas/document-review'
import {
  completeDocumentReview,
  createDocumentReview,
  failDocumentReview,
  getDocumentReview,
  listQueuedDocumentReviews,
  markDocumentReviewProcessing,
} from '../db/document-review'
import { documentReviewInputHash } from './document-review'

type DocumentReviewQueueJob = { reviewId: number }

const queueName = 'document-review'
const queueDataPath = () =>
  process.env.QUEUE_FILE_NAME ??
  process.env.BUNQUEUE_DATA_PATH ??
  `${process.cwd().endsWith('/dist') ? '../' : ''}bunqueue.db`

let queue: Queue<DocumentReviewQueueJob> | undefined
let worker: Worker<DocumentReviewQueueJob, { reviewId: number }> | undefined
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
  queue ??= new bunQueue.Queue<DocumentReviewQueueJob>(queueName, {
    embedded: true,
    dataPath: queueDataPath(),
    defaultJobOptions: { attempts: 3, backoff: 10_000, timeout: 240_000, durable: true },
  })
  return queue
}

async function processDocumentReview(reviewId: number) {
  const review = getDocumentReview(reviewId)
  if (!review || review.status === 'Completed') return { reviewId }
  markDocumentReviewProcessing(reviewId)
  try {
    const { runDocumentReview } = await import('./document-review')
    const result = await runDocumentReview(reviewId)
    completeDocumentReview(reviewId, JSON.stringify(result))
    return { reviewId }
  } catch (error) {
    failDocumentReview(reviewId, error)
    throw error
  }
}

export async function startDocumentReviewWorker() {
  if (worker || !usePersistentQueue()) return worker
  const bunQueue = await getBunQueue()
  if (!bunQueue) return undefined
  worker = new bunQueue.Worker<DocumentReviewQueueJob, { reviewId: number }>(
    queueName,
    (job) => processDocumentReview(job.data.reviewId),
    {
      embedded: true,
      dataPath: queueDataPath(),
      concurrency: 1,
      heartbeatInterval: 10_000,
    },
  )
  worker.on('error', (error) => console.error('Document review worker error', error))
  return worker
}

export type EnqueueDocumentReviewResult =
  | { review: NonNullable<ReturnType<typeof getDocumentReview>>; reason?: undefined }
  | { review: null; reason: 'missing-results' }

export async function enqueueDocumentReview(
  generationRunId: number,
): Promise<EnqueueDocumentReviewResult> {
  const inputHash = documentReviewInputHash(generationRunId)
  if (!inputHash) return { review: null, reason: 'missing-results' }
  const review = createDocumentReview({
    generationRunId,
    inputHash,
    model:
      process.env.OPENAI_MODEL_DOCUMENT_REVIEW ?? process.env.OPENAI_MODEL_DEFAULT ?? 'gpt-5-mini',
    promptVersion: documentReviewPromptVersion,
    schemaVersion: documentReviewSchemaVersion,
  })
  const persistentQueue = await getQueue()
  if (!persistentQueue) {
    void processDocumentReview(review.id).catch((error) =>
      console.error('Development document review failed', error),
    )
    return { review }
  }
  await persistentQueue.add(
    'review-documents',
    { reviewId: review.id },
    { jobId: review.queueJobId, durable: true },
  )
  return { review }
}

export async function recoverQueuedDocumentReviews() {
  const queued = listQueuedDocumentReviews()
  const persistentQueue = await getQueue()
  for (const review of queued) {
    if (!persistentQueue) {
      void processDocumentReview(review.id).catch((error) =>
        console.error('Development document review recovery failed', error),
      )
      continue
    }
    await persistentQueue.add(
      'review-documents',
      { reviewId: review.id },
      { jobId: review.queueJobId, durable: true },
    )
  }
}
