import { createApp } from 'honox/server'
import { assertDatabaseReady } from '../src/db/health'
import { startAnalysisWorkflowRecovery } from '../src/lib/analysis/recovery'
import {
  recoverQueuedDocumentReviews,
  startDocumentReviewWorker,
} from '../src/lib/document-review/queue'
import { recoverQueuedGenerationRuns, startGenerationWorker } from '../src/lib/generation/queue'
import { recoverPendingJobIntakeItems } from '../src/lib/job-intake/queue'

console.log('run createApp')
assertDatabaseReady()
startAnalysisWorkflowRecovery()
void startGenerationWorker()
void startDocumentReviewWorker()
void recoverQueuedGenerationRuns().catch((error) =>
  console.error('Generation queue recovery failed', error),
)
void recoverQueuedDocumentReviews().catch((error) =>
  console.error('Document review queue recovery failed', error),
)
void recoverPendingJobIntakeItems().catch((error) =>
  console.error('Job intake recovery failed', error),
)
export default createApp()
