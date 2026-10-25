import { eq } from 'drizzle-orm'
import { candidateFitModelId } from '../../ai/models'
import { candidateFitPromptVersion } from '../../ai/prompts/candidate-fit'
import { candidateFitSchemaVersion } from '../../ai/schemas/candidate-fit'
import {
  completeAnalysisRun,
  createAnalysisRun,
  failAnalysisRun,
  findReusableAnalysisRun,
  getAnalysisRun,
  markAnalysisRunProcessing,
} from '../../db/analysis'
import { createAnalysisWorkflow } from '../../db/analysis-workflows'
import { db } from '../../db/client'
import { jobPostingAnalyses } from '../../db/schema'
import { buildCandidateAnalysisInput, runCandidateAnalysis } from '../candidate/analysis'

/** Freeze only after the upstream Job Analysis has completed. */
export function prepareCandidateAnalysisRun(jobApplicationId: number, expectedJobRunId?: number) {
  const built = buildCandidateAnalysisInput(jobApplicationId)
  if (!built) return { run: null, reused: false as const, reason: 'missing-analysis' as const }
  if (expectedJobRunId !== undefined && built.snapshot.jobAnalysis.runId !== expectedJobRunId)
    throw new Error('Job Post analysis changed while this workflow was running. Analyze again.')
  const reusable = findReusableAnalysisRun(jobApplicationId, built.inputHash)
  if (reusable) return { run: reusable, reused: true }
  return {
    run: createAnalysisRun({
      jobPostingAnalysisId: built.snapshot.jobAnalysis.runId,
      inputHash: built.inputHash,
      inputSnapshotJson: JSON.stringify(built.snapshot),
      model: candidateFitModelId(),
      promptVersion: candidateFitPromptVersion,
      schemaVersion: candidateFitSchemaVersion,
    }),
    reused: false,
  }
}

export async function executeCandidateAnalysis(runId: number, signal?: AbortSignal) {
  const run = getAnalysisRun(runId)
  if (!run) throw new Error('Candidate analysis run no longer exists.')
  if (run.status === 'Completed') return
  if (run.status === 'Failed')
    throw new Error(run.errorMessage ?? 'Candidate analysis failed. Retry explicitly.')
  if (run.status === 'Processing')
    throw new Error('Candidate analysis is already processing; it is not complete.')
  markAnalysisRunProcessing(runId)
  try {
    const result = await runCandidateAnalysis(runId, signal)
    signal?.throwIfAborted()
    completeAnalysisRun(runId, JSON.stringify(result))
  } catch (error) {
    failAnalysisRun(runId, error)
    throw error
  }
}

export type EnqueueAnalysisResult = ReturnType<typeof prepareCandidateAnalysisRun>

export async function enqueueCandidateAnalysis(
  jobApplicationId: number,
  persisted?: (run: { id: number }) => void,
): Promise<EnqueueAnalysisResult> {
  const result = db.transaction(() => {
    const prepared = prepareCandidateAnalysisRun(jobApplicationId)
    if (!prepared.run) return prepared
    const { jobPostingId } = db
      .select({ jobPostingId: jobPostingAnalyses.jobPostingId })
      .from(jobPostingAnalyses)
      .where(eq(jobPostingAnalyses.id, prepared.run.jobPostingAnalysisId))
      .get()!
    createAnalysisWorkflow({
      sourceKey: `candidate-run:${prepared.run.id}`,
      mode: 'candidate-only',
      jobApplicationId,
      jobPostingId,
      jobAnalysisRunId: prepared.run.jobPostingAnalysisId,
      candidateAnalysisRunId: prepared.run.id,
    })
    persisted?.(prepared.run)
    return prepared
  })
  if (result.run) {
    const { dispatchAnalysisWorkflows } = await import('./workflow')
    await dispatchAnalysisWorkflows()
  }
  return result
}
