import { eq } from 'drizzle-orm'
import { parseJobDescription } from '../../ai/client'
import { jobParserModelId } from '../../ai/models'
import { jobParserPromptVersion } from '../../ai/prompts/job-parser'
import { jobAnalysisSchemaVersion } from '../../ai/schemas/job-analysis'
import { createAnalysisWorkflow } from '../../db/analysis-workflows'
import { db } from '../../db/client'
import {
  completeJobAnalysisRun,
  createJobAnalysisRun,
  failJobAnalysisRun,
  findReusableJobAnalysisRun,
  getJobAnalysisRun,
  markJobAnalysisRunProcessing,
} from '../../db/job-analysis-runs'
import { jobPostings } from '../../db/schema'
import { buildJobAnalysisInput, frozenSuppliedCatalog } from './input'

/** Prepare and freeze a run without dispatching it. Called in the owner's transaction. */
export function prepareJobAnalysisRun(jobPostingId: number) {
  const built = buildJobAnalysisInput(db, jobPostingId)
  if (!built) return { run: null, reused: false as const, reason: 'missing-posting' as const }
  const reusable = findReusableJobAnalysisRun(db, jobPostingId, built.inputHash)
  if (reusable) return { run: reusable, reused: true }
  return {
    run: createJobAnalysisRun(db, {
      jobPostingId,
      inputHash: built.inputHash,
      frozenInputJson: JSON.stringify(built.snapshot),
      model: jobParserModelId(),
      promptVersion: jobParserPromptVersion,
      schemaVersion: jobAnalysisSchemaVersion,
    }),
    reused: false,
  }
}

export async function executeJobAnalysis(runId: number, signal?: AbortSignal) {
  const run = getJobAnalysisRun(db, runId)
  if (!run) throw new Error('Job analysis run no longer exists.')
  if (run.status === 'Completed') return
  if (run.status === 'Failed')
    throw new Error(run.errorMessage ?? 'Job analysis failed. Retry explicitly.')
  if (run.status === 'Processing')
    throw new Error('Job analysis is already processing; it is not complete.')
  markJobAnalysisRunProcessing(db, runId)
  try {
    const posting = db.select().from(jobPostings).where(eq(jobPostings.id, run.jobPostingId)).get()
    if (!posting) throw new Error('Job posting no longer exists.')
    const parsed = await parseJobDescription(
      process.env,
      posting.rawText,
      frozenSuppliedCatalog(run.frozenInputJson),
      signal,
    )
    signal?.throwIfAborted()
    completeJobAnalysisRun(db, runId, parsed)
  } catch (error) {
    failJobAnalysisRun(db, runId, error)
    throw error
  }
}

export type EnqueueJobAnalysisResult = ReturnType<typeof prepareJobAnalysisRun>

export async function enqueueJobAnalysis(
  jobPostingId: number,
  persisted?: (run: { id: number }) => void,
): Promise<EnqueueJobAnalysisResult> {
  const result = db.transaction(() => {
    const prepared = prepareJobAnalysisRun(jobPostingId)
    if (!prepared.run) return prepared
    const posting = db.select().from(jobPostings).where(eq(jobPostings.id, jobPostingId)).get()!
    createAnalysisWorkflow({
      sourceKey: `job-run:${prepared.run.id}`,
      mode: 'job-and-candidate',
      jobApplicationId: posting.jobApplicationId,
      jobPostingId,
      jobAnalysisRunId: prepared.run.id,
    })
    persisted?.(prepared.run)
    return prepared
  })
  if (result.run) {
    const { dispatchAnalysisWorkflows } = await import('../analysis/workflow')
    await dispatchAnalysisWorkflows()
  }
  return result
}
