import type { Queue, Worker } from 'bunqueue/client'
import { eq } from 'drizzle-orm'
import { jobParserPromptVersion } from '../ai/prompts/job-parser'
import { jobAnalysisSchemaVersion } from '../ai/schemas/job-analysis'
import { db } from '../db/client'
import {
  completeJobAnalysisRun,
  createJobAnalysisRun,
  failJobAnalysisRun,
  findReusableJobAnalysisRun,
  getJobAnalysisRun,
  listQueuedJobAnalysisRuns,
  markJobAnalysisRunProcessing,
} from '../db/job-analysis-runs'
import { jobPostings } from '../db/schema'
import { parseJobDescription } from './ai'
import { buildJobAnalysisInput } from './job-analysis-input'

type JobAnalysisQueueJob = { runId: number }

const queueName = 'job-analysis'
const queueDataPath = () =>
  process.env.QUEUE_FILE_NAME ??
  process.env.BUNQUEUE_DATA_PATH ??
  `${process.cwd().endsWith('/dist') ? '../' : ''}bunqueue.db`

let queue: Queue<JobAnalysisQueueJob> | undefined
let worker: Worker<JobAnalysisQueueJob, { runId: number }> | undefined
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
  queue ??= new bunQueue.Queue<JobAnalysisQueueJob>(queueName, {
    embedded: true,
    dataPath: queueDataPath(),
    defaultJobOptions: { attempts: 3, backoff: 10_000, timeout: 240_000, durable: true },
  })
  return queue
}

async function processJobAnalysis(
  runId: number,
  updateProgress: (progress: number, message: string) => Promise<unknown>,
) {
  const run = getJobAnalysisRun(db, runId)
  if (!run) return { runId }
  if (run.status === 'Completed') return { runId: run.id }
  markJobAnalysisRunProcessing(db, run.id)
  await updateProgress(10, 'Analyzing job post')
  try {
    const posting = db.select().from(jobPostings).where(eq(jobPostings.id, run.jobPostingId)).get()
    if (!posting) throw new Error('Job posting no longer exists.')
    const parsed = await parseJobDescription(
      process.env as Record<string, string | undefined>,
      posting.rawText,
    )
    completeJobAnalysisRun(db, run.id, parsed)
    await updateProgress(100, 'Complete')
    return { runId: run.id }
  } catch (error) {
    failJobAnalysisRun(db, run.id, error)
    throw error
  }
}

export async function startJobAnalysisWorker() {
  if (worker || !usePersistentQueue()) return worker
  const bunQueue = await getBunQueue()
  if (!bunQueue) return undefined
  worker = new bunQueue.Worker<JobAnalysisQueueJob, { runId: number }>(
    queueName,
    (job) =>
      processJobAnalysis(job.data.runId, (progress, message) =>
        job.updateProgress(progress, message),
      ),
    {
      embedded: true,
      dataPath: queueDataPath(),
      concurrency: 1,
      heartbeatInterval: 10_000,
    },
  )
  worker.on('error', (error) => console.error('Job analysis worker error', error))
  return worker
}

export type EnqueueJobAnalysisResult =
  | { run: NonNullable<ReturnType<typeof getJobAnalysisRun>>; reused: boolean; reason?: undefined }
  | { run: null; reused: false; reason: 'missing-posting' }

/**
 * Persists the frozen input before queueing and returns immediately for
 * polling. A queued or processing run with the same input hash is reused;
 * an explicit rerun after completion creates a new append-only record.
 */
export async function enqueueJobAnalysis(jobPostingId: number): Promise<EnqueueJobAnalysisResult> {
  const built = buildJobAnalysisInput(db, jobPostingId)
  if (!built) return { run: null, reused: false, reason: 'missing-posting' }

  const reusable = findReusableJobAnalysisRun(db, jobPostingId, built.inputHash)
  if (reusable) return { run: reusable, reused: true }

  const model =
    process.env.OPENAI_MODEL_JOB_PARSER ?? process.env.OPENAI_MODEL_DEFAULT ?? 'gpt-5.6-terra'
  const run = createJobAnalysisRun(db, {
    jobPostingId,
    inputHash: built.inputHash,
    frozenInputJson: JSON.stringify(built.snapshot),
    model,
    promptVersion: jobParserPromptVersion,
    schemaVersion: jobAnalysisSchemaVersion,
  })

  const persistentQueue = await getQueue()
  if (!persistentQueue) {
    void processJobAnalysis(run.id, async () => undefined).catch((error) =>
      console.error('Development job analysis failed', error),
    )
    return { run, reused: false }
  }
  await persistentQueue.add(
    'analyze-job',
    { runId: run.id },
    { jobId: run.queueJobId ?? undefined, durable: true },
  )
  return { run, reused: false }
}

export async function recoverQueuedJobAnalysisRuns() {
  const queued = listQueuedJobAnalysisRuns(db)
  const persistentQueue = await getQueue()
  for (const run of queued) {
    if (!persistentQueue) {
      void processJobAnalysis(run.id, async () => undefined).catch((error) =>
        console.error('Development job analysis recovery failed', error),
      )
      continue
    }
    await persistentQueue.add(
      'analyze-job',
      { runId: run.id },
      { jobId: run.queueJobId ?? undefined, durable: true },
    )
  }
}
