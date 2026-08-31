import { createHash } from 'node:crypto'
import { desc, eq, sql } from 'drizzle-orm'
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import type { IntakeItemKind } from '../lib/batch-intake'
import { nowISO, todayISO } from '../lib/date'
import { db } from './client'
import * as schema from './schema'
import type { DbExecutor } from './skill-queries'

export type JobIntakeItemInput = {
  sequence: number
  kind: IntakeItemKind
  raw: string
  normalizedUrl: string | null
  status?: 'pending' | 'needs-pasted-text'
  errorMessage?: string | null
}

export function createJobIntakeBatch() {
  const date = todayISO()
  return db
    .insert(schema.jobIntakeBatches)
    .values({ createdAt: date, updatedAt: date })
    .returning()
    .get()
}

export function createJobIntakeItems(batchId: number, items: JobIntakeItemInput[]) {
  const date = todayISO()
  const created = []
  for (const item of items) {
    const row = db
      .insert(schema.jobIntakeItems)
      .values({
        batchId,
        sequence: item.sequence,
        kind: item.kind,
        raw: item.raw,
        normalizedUrl: item.normalizedUrl,
        status: item.status ?? 'pending',
        errorMessage: item.errorMessage ?? null,
        createdAt: date,
        updatedAt: date,
      })
      .returning()
      .get()
    created.push(row)
  }
  return created
}

export function listJobIntakeBatches() {
  const batches = db
    .select()
    .from(schema.jobIntakeBatches)
    .orderBy(desc(schema.jobIntakeBatches.id))
    .all()
  if (!batches.length) return []
  const items = db
    .select()
    .from(schema.jobIntakeItems)
    .where(
      sql`${schema.jobIntakeItems.batchId} in (${sql.join(
        batches.map((batch) => sql`${batch.id}`),
        sql`, `,
      )})`,
    )
    .orderBy(schema.jobIntakeItems.batchId, schema.jobIntakeItems.sequence)
    .all()
  return batches.map((batch) => ({
    ...batch,
    items: items.filter((item) => item.batchId === batch.id),
  }))
}

export function getJobIntakeItem(itemId: number) {
  return (
    db.select().from(schema.jobIntakeItems).where(eq(schema.jobIntakeItems.id, itemId)).get() ??
    null
  )
}

export function listJobIntakeItems(batchId: number) {
  return db
    .select()
    .from(schema.jobIntakeItems)
    .where(eq(schema.jobIntakeItems.batchId, batchId))
    .orderBy(schema.jobIntakeItems.sequence)
    .all()
}

export function listPendingJobIntakeItems() {
  return db
    .select()
    .from(schema.jobIntakeItems)
    .where(eq(schema.jobIntakeItems.status, 'pending'))
    .orderBy(schema.jobIntakeItems.id)
    .all()
}

export function markJobIntakeItemProcessing(itemId: number) {
  db.update(schema.jobIntakeItems)
    .set({
      status: 'pending',
      attempts: sql`${schema.jobIntakeItems.attempts} + 1`,
      errorMessage: null,
      updatedAt: todayISO(),
    })
    .where(eq(schema.jobIntakeItems.id, itemId))
    .run()
}

export function markJobIntakeItemReady(
  itemId: number,
  input: { jobApplicationId: number; jobPostingId: number; extractedText: string },
) {
  db.update(schema.jobIntakeItems)
    .set({
      status: 'ready',
      extractedText: input.extractedText,
      jobApplicationId: input.jobApplicationId,
      jobPostingId: input.jobPostingId,
      errorMessage: null,
      updatedAt: todayISO(),
    })
    .where(eq(schema.jobIntakeItems.id, itemId))
    .run()
}

export function markJobIntakeItemNeedsPastedText(itemId: number, reason: string) {
  db.update(schema.jobIntakeItems)
    .set({
      status: 'needs-pasted-text',
      errorMessage: reason.slice(0, 1000),
      updatedAt: todayISO(),
    })
    .where(eq(schema.jobIntakeItems.id, itemId))
    .run()
}

export function markJobIntakeItemFailed(itemId: number, error: unknown) {
  const message = error instanceof Error ? error.message : 'Intake failed.'
  db.update(schema.jobIntakeItems)
    .set({ status: 'failed', errorMessage: message.slice(0, 1000), updatedAt: todayISO() })
    .where(eq(schema.jobIntakeItems.id, itemId))
    .run()
}

function getOrCreateCompany(tx: DbExecutor, name: string, date: string) {
  let company = tx
    .select()
    .from(schema.companies)
    .where(sql`lower(${schema.companies.name}) = lower(${name})`)
    .get()
  if (!company) {
    tx.insert(schema.companies)
      .values({ name, createdAt: date, updatedAt: date })
      .onConflictDoNothing()
      .run()
    company = tx
      .select()
      .from(schema.companies)
      .where(sql`lower(${schema.companies.name}) = lower(${name})`)
      .get()
  }
  if (!company) throw new Error('Unable to resolve company')
  return company
}

/**
 * Creates a placeholder application and its immutable job posting from intake
 * text. Company/title/direction/source/URL are placeholders the user confirms
 * during Review; the AI analysis never finalizes them.
 */
export function createIntakeApplication(input: {
  companyName: string
  jobTitle: string
  direction: string
  url: string | null
  rawText: string
}) {
  const date = todayISO()
  const contentHash = createHash('sha256').update(input.rawText).digest('hex')
  return db.transaction((tx) => {
    const company = getOrCreateCompany(tx, input.companyName, date)
    const application = tx
      .insert(schema.jobApplications)
      .values({
        companyId: company.id,
        jobTitle: input.jobTitle,
        direction: input.direction,
        url: input.url,
        postedDate: date,
        priority: 'B',
        applicationSource: 'batch-import',
        status: 'Saved',
        createdAt: date,
        updatedAt: date,
      })
      .returning({ id: schema.jobApplications.id })
      .get()
    const posting = tx
      .insert(schema.jobPostings)
      .values({
        jobApplicationId: application.id,
        rawText: input.rawText,
        capturedAt: nowISO(),
        contentHash,
      })
      .returning({ id: schema.jobPostings.id })
      .get()
    return { applicationId: application.id, postingId: posting.id }
  })
}

export type JobIntakeDb = BunSQLiteDatabase<typeof schema>
