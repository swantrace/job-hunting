import { createApp } from 'honox/server'
import { recoverQueuedAnalysisRuns, startAnalysisWorker } from '../src/lib/analysis-queue'
import {
  recoverQueuedDocumentReviews,
  startDocumentReviewWorker,
} from '../src/lib/document-review-queue'
import { recoverQueuedGenerationRuns, startGenerationWorker } from '../src/lib/generation-queue'
import { recoverQueuedJobAnalysisRuns, startJobAnalysisWorker } from '../src/lib/job-analysis-queue'

console.log('run createApp')
void startGenerationWorker()
void startAnalysisWorker()
void startJobAnalysisWorker()
void startDocumentReviewWorker()
void recoverQueuedGenerationRuns().catch((error) =>
  console.error('Generation queue recovery failed', error),
)
void recoverQueuedAnalysisRuns().catch((error) =>
  console.error('Analysis queue recovery failed', error),
)
void recoverQueuedJobAnalysisRuns().catch((error) =>
  console.error('Job analysis queue recovery failed', error),
)
void recoverQueuedDocumentReviews().catch((error) =>
  console.error('Document review queue recovery failed', error),
)
export default createApp()
