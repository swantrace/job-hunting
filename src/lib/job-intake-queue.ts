import {
  createIntakeApplication,
  getJobIntakeItem,
  listJobIntakeItems,
  listPendingJobIntakeItems,
  markJobIntakeItemFailed,
  markJobIntakeItemNeedsPastedText,
  markJobIntakeItemProcessing,
  markJobIntakeItemReady,
} from '../db/job-intake'
import { validateIntakeUrl } from './batch-intake'
import { listDirections } from './directions'
import { fetchJobPostingText } from './job-intake-fetch'

function companyNameFor(item: { kind: string; normalizedUrl: string | null }): string {
  if (item.kind === 'url' && item.normalizedUrl) {
    try {
      return new URL(item.normalizedUrl).hostname.replace(/^www\./, '') || 'Imported'
    } catch {
      return 'Imported'
    }
  }
  return 'Imported'
}

/**
 * Processes one intake item: fetch/extract a safe https URL or accept pasted
 * text, create a placeholder application + posting, and queue the existing Job
 * Analysis. Failed or blocked links retain their URL and become
 * `needs-pasted-text`; blank or error HTML is never sent to the LLM.
 */
export async function processJobIntakeItem(itemId: number) {
  const item = getJobIntakeItem(itemId)
  if (!item) return { itemId }
  if (item.status === 'ready' || item.status === 'needs-pasted-text') return { itemId }
  markJobIntakeItemProcessing(itemId)

  try {
    let text: string
    if (item.kind === 'url') {
      if (!item.normalizedUrl) {
        markJobIntakeItemNeedsPastedText(itemId, 'No valid URL was recorded.')
        return { itemId }
      }
      const safety = validateIntakeUrl(item.normalizedUrl)
      if (!safety.ok) {
        markJobIntakeItemNeedsPastedText(itemId, safety.reason ?? 'Unsafe URL.')
        return { itemId }
      }
      const fetched = await fetchJobPostingText(item.normalizedUrl)
      if (!fetched.ok) {
        markJobIntakeItemNeedsPastedText(itemId, fetched.reason)
        return { itemId }
      }
      text = fetched.text
    } else {
      text = item.raw
    }

    const { applicationId, postingId } = createIntakeApplication({
      companyName: companyNameFor(item),
      jobTitle: 'Imported job',
      direction: listDirections()[0]?.id ?? 'fullstack',
      url: item.normalizedUrl,
      rawText: text,
    })
    const { enqueueJobAnalysis } = await import('./job-analysis-queue')
    await enqueueJobAnalysis(postingId)
    markJobIntakeItemReady(itemId, {
      jobApplicationId: applicationId,
      jobPostingId: postingId,
      extractedText: text,
    })
    return { itemId, applicationId }
  } catch (error) {
    markJobIntakeItemFailed(itemId, error)
    throw error
  }
}

/** Processes every pending item in one batch with bounded (sequential) concurrency. */
export async function processJobIntakeBatch(batchId: number) {
  const items = listJobIntakeItems(batchId)
  for (const item of items) {
    if (item.status !== 'pending') continue
    try {
      await processJobIntakeItem(item.id)
    } catch (error) {
      console.error('Job intake item failed', item.id, error)
    }
  }
}

export function enqueueJobIntakeBatch(batchId: number) {
  void processJobIntakeBatch(batchId).catch((error) =>
    console.error('Job intake batch processing failed', error),
  )
}

export async function recoverPendingJobIntakeItems() {
  for (const item of listPendingJobIntakeItems()) {
    try {
      await processJobIntakeItem(item.id)
    } catch (error) {
      console.error('Job intake recovery failed', item.id, error)
    }
  }
}
