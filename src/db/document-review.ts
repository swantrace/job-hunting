import { and, desc, eq, sql } from 'drizzle-orm'
import { todayISO } from '../lib/date'
import { db } from './client'
import { type DocumentReview, documentReviews } from './schema'

export type { DocumentReview }

export function createDocumentReview(input: {
  generationRunId: number
  inputHash: string
  model: string
  promptVersion: string
  schemaVersion: string
}) {
  const date = todayISO()
  return db
    .insert(documentReviews)
    .values({
      generationRunId: input.generationRunId,
      queueJobId: `document-review-${crypto.randomUUID()}`,
      status: 'Queued',
      inputHash: input.inputHash,
      model: input.model,
      promptVersion: input.promptVersion,
      schemaVersion: input.schemaVersion,
      createdAt: date,
      updatedAt: date,
    })
    .returning()
    .get()
}

export function getDocumentReview(reviewId: number) {
  return db.select().from(documentReviews).where(eq(documentReviews.id, reviewId)).get() ?? null
}

export function listDocumentReviews(generationRunId: number) {
  return db
    .select()
    .from(documentReviews)
    .where(eq(documentReviews.generationRunId, generationRunId))
    .orderBy(desc(documentReviews.id))
    .all()
}

export function listQueuedDocumentReviews() {
  return db
    .select()
    .from(documentReviews)
    .where(eq(documentReviews.status, 'Queued'))
    .orderBy(documentReviews.id)
    .all()
}

export function markDocumentReviewProcessing(reviewId: number) {
  const date = todayISO()
  db.update(documentReviews)
    .set({
      status: 'Processing',
      attempts: sql`${documentReviews.attempts} + 1`,
      errorMessage: null,
      startedAt: date,
      updatedAt: date,
    })
    .where(eq(documentReviews.id, reviewId))
    .run()
}

export function completeDocumentReview(reviewId: number, resultJson: string) {
  const date = todayISO()
  db.update(documentReviews)
    .set({
      status: 'Completed',
      resultJson,
      errorMessage: null,
      completedAt: date,
      updatedAt: date,
    })
    .where(eq(documentReviews.id, reviewId))
    .run()
}

export function failDocumentReview(reviewId: number, error: unknown) {
  const message = error instanceof Error ? error.message : 'Document review failed.'
  db.update(documentReviews)
    .set({ status: 'Failed', errorMessage: message.slice(0, 2000), updatedAt: todayISO() })
    .where(eq(documentReviews.id, reviewId))
    .run()
}

export function documentReviewBelongsToGenerationRun(reviewId: number, generationRunId: number) {
  return !!db
    .select({ id: documentReviews.id })
    .from(documentReviews)
    .where(
      and(eq(documentReviews.id, reviewId), eq(documentReviews.generationRunId, generationRunId)),
    )
    .get()
}
