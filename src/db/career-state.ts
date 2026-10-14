import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { nowISO } from '../lib/date'
import { db } from './client'
import { careerState } from './schema'
import type { DbExecutor } from './skill-queries'

/**
 * The database-owned career revision state. `career_state` is the singleton
 * bookkeeping row every career write updates: `content_hash` is a chained
 * SHA-256 over each changed entity hash and `revision` increases by one per
 * real change. Date-only timestamps cannot detect same-day edits, so this
 * counter and hash are the freshness identity.
 */

/** Executor with transactions, for writes spanning several statements. */
export type CareerDb = Pick<typeof db, 'select' | 'insert' | 'delete' | 'update' | 'transaction'>

/** Result of a write addressed by internal id (records, skills). */
export type CareerWriteResult = { id: number; changed: boolean; revision: number }

/** Result of a singleton or key-addressed write (candidate, preferences, directions). */
export type CareerSaveResult = { changed: boolean; revision: number }

/** A stale form submitted a revision that is no longer current. */
export class CareerRevisionConflictError extends Error {
  constructor(
    entity: string,
    id: number | string,
    readonly expected: number,
    readonly actual: number,
  ) {
    super(
      `${entity} ${id} changed since it was loaded: expected revision ${expected}, found ${actual}.`,
    )
  }
}

/** A write referenced an unknown, retired or otherwise unusable record. */
export class CareerReferenceError extends Error {}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/**
 * Deterministic fingerprint of a logical entity content object. Key order and
 * `undefined` placeholders do not change the fingerprint, so re-saving
 * identical content is a no-op regardless of how the caller built the object.
 */
export function stableFingerprint(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex')
}

function requireCareerState(executor: DbExecutor) {
  const row = executor.select().from(careerState).where(eq(careerState.id, 1)).get()
  if (!row) {
    throw new Error(
      'career_state row is missing. Run the database migrations (bun run db:migrate).',
    )
  }
  return row
}

export function readCareerState(executor: DbExecutor = db): {
  revision: number
  contentHash: string
} {
  const row = requireCareerState(executor)
  return { revision: row.revision, contentHash: row.contentHash }
}

/**
 * Records one real content change and returns the new aggregate revision. The
 * new hash chains the previous hash with the changed entity's hash, so the
 * aggregate identity differs for every distinct history. Callers must not call
 * this when the content is unchanged.
 */
export function recordCareerChange(executor: DbExecutor, entityHash: string): number {
  const current = requireCareerState(executor)
  const revision = current.revision + 1
  const contentHash = createHash('sha256')
    .update(`${current.contentHash}|${entityHash}`)
    .digest('hex')
  executor
    .update(careerState)
    .set({ revision, contentHash, updatedAt: nowISO() })
    .where(eq(careerState.id, 1))
    .run()
  return revision
}

/** Throws when a submitted form revision is not the current record revision. */
export function assertExpectedRevision(
  entity: string,
  id: number | string,
  expected: number | undefined,
  actual: number,
): void {
  if (expected !== undefined && expected !== actual) {
    throw new CareerRevisionConflictError(entity, id, expected, actual)
  }
}
