import { and, eq, inArray } from 'drizzle-orm'
import { createAnalysisWorkflow } from '../../db/analysis-workflows'
import { db } from '../../db/client'
import {
  analysisWorkflows,
  applicationAnalysisRuns,
  jobPostingAnalyses,
  jobPostings,
} from '../../db/schema'
import { dispatchExtensionIntake } from '../job-intake/extension-queue'
import { advanceBatchAnalyses } from './batch'
import { analysisRuntime, dispatchAnalysisWorkflows, getAnalysisEngine } from './workflow'

/** Upgrade pending pre-Engine runs without recreating their paid input snapshots. */
function adoptLegacyRuns() {
  const requests = db.select().from(analysisWorkflows).all()
  const jobIds = new Set(requests.map((r) => r.jobAnalysisRunId))
  const candidateIds = new Set(requests.map((r) => r.candidateAnalysisRunId))
  const jobs = db
    .select()
    .from(jobPostingAnalyses)
    .where(inArray(jobPostingAnalyses.status, ['Queued', 'Processing']))
    .all()
  for (const job of jobs) {
    if (jobIds.has(job.id)) continue
    const posting = db.select().from(jobPostings).where(eq(jobPostings.id, job.jobPostingId)).get()!
    createAnalysisWorkflow({
      sourceKey: `job-run:${job.id}`,
      mode: 'job-and-candidate',
      jobApplicationId: posting.jobApplicationId,
      jobPostingId: posting.id,
      jobAnalysisRunId: job.id,
    })
  }
  const candidates = db
    .select({ run: applicationAnalysisRuns, posting: jobPostings })
    .from(applicationAnalysisRuns)
    .innerJoin(
      jobPostingAnalyses,
      eq(jobPostingAnalyses.id, applicationAnalysisRuns.jobPostingAnalysisId),
    )
    .innerJoin(jobPostings, eq(jobPostings.id, jobPostingAnalyses.jobPostingId))
    .where(inArray(applicationAnalysisRuns.status, ['Queued', 'Processing']))
    .all()
  for (const { run, posting } of candidates) {
    if (candidateIds.has(run.id)) continue
    // A pre-upgrade chain may have persisted its candidate before recording the
    // source link. Reuse that child instead of starting another model call.
    const owner = db
      .select()
      .from(analysisWorkflows)
      .where(
        and(
          eq(analysisWorkflows.jobAnalysisRunId, run.jobPostingAnalysisId),
          inArray(analysisWorkflows.status, ['Queued', 'Processing']),
        ),
      )
      .get()
    if (owner && !owner.candidateAnalysisRunId) {
      db.update(analysisWorkflows)
        .set({ candidateAnalysisRunId: run.id })
        .where(eq(analysisWorkflows.id, owner.id))
        .run()
      continue
    }
    createAnalysisWorkflow({
      sourceKey: `candidate-run:${run.id}`,
      mode: 'candidate-only',
      jobApplicationId: posting.jobApplicationId,
      jobPostingId: posting.id,
      jobAnalysisRunId: run.jobPostingAnalysisId,
      candidateAnalysisRunId: run.id,
    })
  }
}

export async function recoverAnalysisWorkflows() {
  if (analysisRuntime.recovering) return
  analysisRuntime.recovering = true
  try {
    // Source rows must claim existing run IDs before adopting standalone runs.
    await dispatchExtensionIntake()
    await advanceBatchAnalyses()
    adoptLegacyRuns()
    await getAnalysisEngine()
    await dispatchAnalysisWorkflows()
  } finally {
    analysisRuntime.recovering = false
  }
}

export function startAnalysisWorkflowRecovery() {
  if (analysisRuntime.recoveryTimer) return analysisRuntime.recoveryTimer
  const recover = () =>
    void recoverAnalysisWorkflows().catch((error) =>
      console.error('Analysis workflow recovery failed', error),
    )
  recover()
  // Delivery/projection repair only, not a second step scheduler.
  analysisRuntime.recoveryTimer = setInterval(recover, 10_000)
  analysisRuntime.recoveryTimer.unref()
  return analysisRuntime.recoveryTimer
}
