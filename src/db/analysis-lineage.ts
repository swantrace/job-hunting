import { eq } from 'drizzle-orm'
import { db } from './client'
import { applicationAnalysisRuns } from './schema'

type LineageExecutor = Pick<typeof db, 'select'>

export function jobPostingAnalysisIdForCandidateRun(
  runId: number,
  executor: LineageExecutor = db,
): number | null {
  return (
    executor
      .select({ jobPostingAnalysisId: applicationAnalysisRuns.jobPostingAnalysisId })
      .from(applicationAnalysisRuns)
      .where(eq(applicationAnalysisRuns.id, runId))
      .get()?.jobPostingAnalysisId ?? null
  )
}
