import { and, eq, inArray, sql } from 'drizzle-orm'
import { canonicalHash } from '../lib/canonical-hash'
import { nowISO } from '../lib/date'
import {
  type CaptureItem,
  captureEnvelopeSchema,
  captureItemSchema,
  IntakeError,
  terminalStatuses,
} from '../lib/job-intake/contracts'
import { sourceIdentities } from '../lib/job-intake/identity'
import { captureProvenance, metadataConflictCount } from '../lib/job-intake/provenance'
import { listCareerDirections } from './career-directions'
import { readCareerCandidate } from './career-facts'
import { db } from './client'
import {
  analysisRunDecisions,
  applicationAnalysisRuns,
  companies,
  jobApplications,
  jobIntakeBatches,
  jobIntakeItems,
  jobPostingAnalyses,
  jobPostings,
  jobSourceIdentities,
} from './schema'

export function acceptExtensionBatch(value: unknown, key: string) {
  if (!/^[\w-]{16,120}$/.test(key))
    throw new IntakeError(
      'invalid-idempotency-key',
      'Supply a stable Idempotency-Key of 16–120 characters.',
    )
  const envelope = captureEnvelopeSchema.safeParse(value)
  if (!envelope.success)
    throw new IntakeError('invalid-envelope', envelope.error.issues.map((i) => i.message).join(' '))
  const parsed = envelope.data.items.map((item) => captureItemSchema.safeParse(item))
  const requestHash = canonicalHash({
    ...envelope.data,
    items: parsed.map((p, index) => (p.success ? p.data : envelope.data.items[index])),
  })
  return db.transaction((tx) => {
    const byKey = tx
      .select()
      .from(jobIntakeBatches)
      .where(eq(jobIntakeBatches.idempotencyKey, key))
      .get()
    const byClient = tx
      .select()
      .from(jobIntakeBatches)
      .where(eq(jobIntakeBatches.clientBatchId, envelope.data.clientBatchId))
      .get()
    if (byKey || byClient) {
      const existing = byKey ?? byClient!
      if (existing.requestHash !== requestHash || existing.idempotencyKey !== key)
        throw new IntakeError(
          'idempotency-conflict',
          'This submission ID was already used with another request.',
          409,
        )
      return { batchId: existing.id, replayed: true, allRejected: parsed.every((p) => !p.success) }
    }
    const date = nowISO()
    const batch = tx
      .insert(jobIntakeBatches)
      .values({
        clientBatchId: envelope.data.clientBatchId,
        idempotencyKey: key,
        requestHash,
        createdAt: date,
        updatedAt: date,
      })
      .returning()
      .get()
    for (const [index, item] of parsed.entries()) {
      const valid = item.success ? item.data : null
      tx.insert(jobIntakeItems)
        .values({
          batchId: batch.id,
          sequence: index + 1,
          kind: 'text',
          clientItemId: (envelope.data.items[index] as { clientItemId: string }).clientItemId,
          raw: valid?.rawText ?? '',
          normalizedUrl: valid?.sourceUrl ?? null,
          payloadJson: valid ? JSON.stringify(valid) : null,
          pipelineStatus: valid ? 'accepted' : 'rejected',
          stage: valid ? 'intake' : 'done',
          errorCode: valid ? null : 'invalid-item',
          fieldErrorsJson: item.success ? null : JSON.stringify(item.error.flatten().fieldErrors),
          createdAt: date,
          updatedAt: date,
        })
        .run()
    }
    return { batchId: batch.id, replayed: false, allRejected: parsed.every((p) => !p.success) }
  })
}

export function updateExtensionItem(
  id: number,
  changes: Partial<typeof jobIntakeItems.$inferInsert>,
) {
  db.transaction((tx) => {
    const row = tx.select().from(jobIntakeItems).where(eq(jobIntakeItems.id, id)).get()
    if (!row) return
    tx.update(jobIntakeItems)
      .set({ ...changes, updatedAt: nowISO() })
      .where(eq(jobIntakeItems.id, id))
      .run()
    tx.update(jobIntakeBatches)
      .set({ revision: sql`${jobIntakeBatches.revision} + 1`, updatedAt: nowISO() })
      .where(eq(jobIntakeBatches.id, row.batchId))
      .run()
  })
}

/** Claims application identity and saves the raw post atomically, before any network call. */
export function prepareExtensionItem(id: number) {
  return db.transaction((tx) => {
    const row = tx.select().from(jobIntakeItems).where(eq(jobIntakeItems.id, id)).get()
    if (!row || !row.payloadJson)
      throw new IntakeError('missing-item', 'Intake item not found.', 404)
    if (row.jobApplicationId) return row
    tx.update(jobIntakeBatches)
      .set({ revision: sql`${jobIntakeBatches.revision} + 1`, updatedAt: nowISO() })
      .where(eq(jobIntakeBatches.id, row.batchId))
      .run()
    const item: CaptureItem = captureItemSchema.parse(JSON.parse(row.payloadJson))
    const identities = sourceIdentities(item)
    const owners = tx
      .select()
      .from(jobSourceIdentities)
      .where(inArray(jobSourceIdentities.identity, identities))
      .all()
    const old = tx
      .select()
      .from(jobApplications)
      .where(eq(jobApplications.url, item.sourceUrl))
      .get()
    const ownerIds = new Set([...owners.map((o) => o.jobApplicationId), ...(old ? [old.id] : [])])
    if (ownerIds.size > 1)
      throw new IntakeError(
        'identity-conflict',
        'URL identities refer to different existing applications.',
        409,
      )
    const ownerId = [...ownerIds][0]
    if (ownerId) {
      for (const identity of identities)
        tx.insert(jobSourceIdentities)
          .values({ identity, jobApplicationId: ownerId })
          .onConflictDoNothing()
          .run()
      tx.update(jobIntakeItems)
        .set({
          jobApplicationId: ownerId,
          pipelineStatus: 'duplicate',
          stage: 'done',
          status: 'ready',
          claimedAt: null,
          updatedAt: nowISO(),
        })
        .where(eq(jobIntakeItems.id, id))
        .run()
      return tx.select().from(jobIntakeItems).where(eq(jobIntakeItems.id, id)).get()!
    }
    const direction = listCareerDirections(tx)[0]?.key
    if (!readCareerCandidate(tx) || !direction)
      throw new IntakeError(
        'career-onboarding-required',
        'Add your candidate facts and at least one direction before analysis.',
      )
    const date = nowISO()
    const meta = item.suggestedMetadata ?? {}
    const companyName = meta.companyName ?? 'Imported'
    tx.insert(companies)
      .values({ name: companyName, createdAt: date, updatedAt: date })
      .onConflictDoNothing()
      .run()
    const company = tx
      .select()
      .from(companies)
      .where(sql`lower(${companies.name}) = lower(${companyName})`)
      .get()!
    const application = tx
      .insert(jobApplications)
      .values({
        companyId: company.id,
        jobTitle: meta.jobTitle ?? 'Imported job',
        direction,
        url: item.sourceUrl,
        location: meta.location,
        postedDate: meta.postedDate ?? null,
        salary: meta.salary,
        applicationSource: item.applicationSource,
        fieldProvenanceJson: captureProvenance({
          ...meta,
          companyName: meta.companyName,
          url: item.sourceUrl,
          applicationSource: item.applicationSource,
        }),
        priority: 'B',
        status: 'Saved',
        createdAt: date,
        updatedAt: date,
      })
      .returning()
      .get()
    const posting = tx
      .insert(jobPostings)
      .values({
        jobApplicationId: application.id,
        rawText: item.rawText,
        capturedAt: item.capture?.capturedAt
          ? new Date(item.capture.capturedAt).toISOString()
          : date,
        contentHash: canonicalHash(item.rawText),
      })
      .returning()
      .get()
    for (const identity of identities)
      tx.insert(jobSourceIdentities).values({ identity, jobApplicationId: application.id }).run()
    tx.update(jobIntakeItems)
      .set({
        jobApplicationId: application.id,
        jobPostingId: posting.id,
        extractedText: item.rawText,
        pipelineStatus: 'processing',
        stage: 'job-analysis',
        updatedAt: date,
      })
      .where(eq(jobIntakeItems.id, id))
      .run()
    return tx.select().from(jobIntakeItems).where(eq(jobIntakeItems.id, id)).get()!
  })
}

export function extensionBatchStatus(batchId: number) {
  return db.transaction((tx) => {
    let batch = tx.select().from(jobIntakeBatches).where(eq(jobIntakeBatches.id, batchId)).get()
    if (!batch?.clientBatchId) return null
    const rows = tx
      .select()
      .from(jobIntakeItems)
      .where(eq(jobIntakeItems.batchId, batchId))
      .orderBy(jobIntakeItems.sequence)
      .all()
    const items = rows.map((row) => {
      const application = row.jobApplicationId
        ? tx
            .select()
            .from(jobApplications)
            .where(eq(jobApplications.id, row.jobApplicationId))
            .get()
        : null
      const decisions = row.candidateAnalysisRunId
        ? tx
            .select()
            .from(analysisRunDecisions)
            .where(
              and(
                eq(analysisRunDecisions.applicationAnalysisRunId, row.candidateAnalysisRunId),
                eq(analysisRunDecisions.decision, 'pending'),
              ),
            )
            .all().length
        : 0
      return {
        clientItemId: row.clientItemId,
        itemId: row.id,
        status: row.pipelineStatus!,
        stage: row.stage,
        jobAnalysisRunId: row.jobAnalysisRunId,
        candidateAnalysisRunId: row.candidateAnalysisRunId,
        applicationUrl: application
          ? `/applications/${application.id}/workspace?workspaceTab=review`
          : null,
        decisionCount: decisions,
        metadataConflictCount: metadataConflictCount(application?.fieldProvenanceJson ?? null),
        retryable: row.pipelineStatus === 'queued',
        error: row.errorCode
          ? {
              code: row.errorCode,
              message: row.errorMessage ?? 'This item could not be processed.',
              fieldErrors: row.fieldErrorsJson ? JSON.parse(row.fieldErrorsJson) : undefined,
            }
          : null,
      }
    })
    const counts = Object.fromEntries(
      ['accepted', 'queued', 'processing', 'completed', 'duplicate', 'failed', 'rejected'].map(
        (status) => [status, items.filter((i) => i.status === status).length],
      ),
    )
    const isTerminal = items.every((i) => terminalStatuses.includes(i.status))
    if (isTerminal && !batch.terminalRevision) {
      batch = tx
        .update(jobIntakeBatches)
        .set({
          terminalRevision: crypto.randomUUID(),
          revision: sql`${jobIntakeBatches.revision} + 1`,
          updatedAt: nowISO(),
        })
        .where(eq(jobIntakeBatches.id, batchId))
        .returning()
        .get()!
    }
    return {
      schemaVersion: 1,
      batchId,
      status: !isTerminal
        ? 'processing'
        : counts.failed || counts.rejected
          ? 'completed-with-errors'
          : 'completed',
      revision: batch.revision,
      terminalRevision: batch.terminalRevision,
      isTerminal,
      total: items.length,
      counts,
      decisionCount: items.reduce((sum, i) => sum + i.decisionCount, 0),
      statusUrl: `/api/v1/job-intake/batches/${batchId}`,
      reviewUrl: `/applications/import?batchId=${batchId}#intake-batch-${batchId}`,
      items,
    }
  })
}

export function getExtensionRun(stage: 'job-analysis' | 'candidate-analysis', id: number) {
  const table = stage === 'job-analysis' ? jobPostingAnalyses : applicationAnalysisRuns
  return db.select().from(table).where(eq(table.id, id)).get()
}
