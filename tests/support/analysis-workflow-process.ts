// Hard-crash fixture: deliberately exits between business and engine commits.
import { Engine } from 'bunqueue/workflow'
import { eq } from 'drizzle-orm'
import { markAnalysisRunProcessing } from '../../src/db/analysis'
import { db } from '../../src/db/client'
import { getJobAnalysisRun, markJobAnalysisRunProcessing } from '../../src/db/job-analysis-runs'
import { applicationAnalysisRuns, jobPostingAnalyses } from '../../src/db/schema'
import {
  analysisQueuePath,
  analysisWorkflowName,
  createAnalysisWorkflowDefinition,
} from '../../src/lib/analysis/workflow'

const requestId = Number(process.argv[2])
const mode = process.argv[3]
const definition = await createAnalysisWorkflowDefinition({
  job: async (id) => {
    markJobAnalysisRunProcessing(db, id)
    db.update(jobPostingAnalyses)
      .set({ status: 'Completed', completedAt: new Date().toISOString() })
      .where(eq(jobPostingAnalyses.id, id))
      .run()
    if (mode === 'after-job') process.exit(73)
    if (mode === 'after-candidate') return
    throw new Error(`Unexpected job execution ${getJobAnalysisRun(db, id)?.id}`)
  },
  candidate: async (id) => {
    if (mode === 'after-candidate') {
      markAnalysisRunProcessing(id)
      db.update(applicationAnalysisRuns)
        .set({ status: 'Completed', completedAt: new Date().toISOString() })
        .where(eq(applicationAnalysisRuns.id, id))
        .run()
      process.exit(76)
    }
    throw new Error('Candidate must run only after recovery.')
  },
})
const engine = new Engine({
  embedded: true,
  dataPath: analysisQueuePath(),
  concurrency: 3,
  onEvent: (event) => {
    if (mode === 'before-publication' && event.type === 'workflow:started') process.exit(74)
  },
})
engine.register(definition)
await engine.start(analysisWorkflowName, { requestId })
setTimeout(() => process.exit(75), 5000)
