import { createApp } from 'honox/server'
import { recoverQueuedAnalysisRuns, startAnalysisWorker } from '../src/lib/analysis-queue'
import {
  recoverQueuedDocumentReviews,
  startDocumentReviewWorker,
} from '../src/lib/document-review-queue'
import { recoverQueuedGenerationRuns, startGenerationWorker } from '../src/lib/generation-queue'

console.log('run createApp')
void startGenerationWorker()
void startAnalysisWorker()
void startDocumentReviewWorker()
void recoverQueuedGenerationRuns().catch((error) =>
  console.error('Generation queue recovery failed', error),
)
void recoverQueuedAnalysisRuns().catch((error) =>
  console.error('Analysis queue recovery failed', error),
)
void recoverQueuedDocumentReviews().catch((error) =>
  console.error('Document review queue recovery failed', error),
)
export default createApp()
