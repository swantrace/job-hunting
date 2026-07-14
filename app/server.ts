import { createApp } from 'honox/server'
import { recoverQueuedGenerationRuns, startGenerationWorker } from '../src/lib/generation-queue'

console.log('run createApp')
void startGenerationWorker()
void recoverQueuedGenerationRuns().catch((error) =>
  console.error('Generation queue recovery failed', error),
)
export default createApp()
