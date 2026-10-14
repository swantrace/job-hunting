import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { jsonValueSchema, parseJsonColumn, serializeJsonColumn } from '../lib/career/json-schemas'
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
  updatedAt: string
} {
  const row = requireCareerState(executor)
  return { revision: row.revision, contentHash: row.contentHash, updatedAt: row.updatedAt }
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

// ---------------------------------------------------------------------------
// Career state documents (legacy JSON versions and extension metadata)
// ---------------------------------------------------------------------------

/**
 * Per-record extension fields that have no relational column, keyed by record
 * kind and stable key. The import stores anything the current schema cannot
 * express here, and the export reads it back, so unknown author fields survive.
 */
export type CareerStateExtensionRecords = Record<string, Record<string, unknown>>

export type CareerStateDocuments = {
  revision: number
  contentHash: string
  /** Raw legacy source documents (`candidate.json`, taxonomy, Base Resume entries). */
  legacyDocuments: unknown
  /** Document-level extension metadata carried by a dataset. */
  extensions: Record<string, unknown>
  /** Fields with no relational column, by `kind -> stableKey -> fields`. */
  records: CareerStateExtensionRecords
}

const stateDocumentStoreSchema = z.looseObject({
  extensions: z.record(z.string(), z.unknown()).optional(),
  records: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
})

function normalizedStore(store: z.infer<typeof stateDocumentStoreSchema>) {
  const extensions = store.extensions ?? {}
  const records = store.records ?? {}
  if (Object.keys(extensions).length === 0 && Object.keys(records).length === 0) return null
  return { extensions, records }
}

export function readCareerStateDocuments(executor: DbExecutor = db): CareerStateDocuments {
  const row = requireCareerState(executor)
  const store = parseJsonColumn(
    row.extensionJson,
    stateDocumentStoreSchema,
    {},
    'career_state.extension_json',
  )
  const normalized = normalizedStore(store)
  return {
    revision: row.revision,
    contentHash: row.contentHash,
    legacyDocuments: parseJsonColumn(
      row.legacyDocumentsJson,
      jsonValueSchema,
      null,
      'career_state.legacy_documents_json',
    ),
    extensions: normalized?.extensions ?? {},
    records: normalized?.records ?? {},
  }
}

/**
 * Persists the legacy documents and extension metadata. Returns `true` only when
 * the stored value really changed; an identical write is invisible and does not
 * bump `career_state.revision`.
 */
export function writeCareerStateDocuments(
  executor: DbExecutor,
  input: {
    legacyDocuments?: unknown
    extensions?: Record<string, unknown>
    records?: CareerStateExtensionRecords
  },
): boolean {
  requireCareerState(executor)
  const current = readCareerStateDocuments(executor)
  const legacy =
    input.legacyDocuments === undefined ? current.legacyDocuments : (input.legacyDocuments ?? null)
  const extensions = input.extensions === undefined ? current.extensions : input.extensions
  const records = input.records === undefined ? current.records : input.records
  const store = normalizedStore({ extensions, records })
  const currentStore = normalizedStore({ extensions: current.extensions, records: current.records })
  if (
    stableFingerprint(current.legacyDocuments) === stableFingerprint(legacy) &&
    stableFingerprint(currentStore) === stableFingerprint(store)
  ) {
    return false
  }
  executor
    .update(careerState)
    .set({
      legacyDocumentsJson: legacy === null ? null : serializeJsonColumn(legacy),
      extensionJson: store === null ? null : serializeJsonColumn(store),
      updatedAt: nowISO(),
    })
    .where(eq(careerState.id, 1))
    .run()
  recordCareerChange(executor, stableFingerprint({ legacy, store }))
  return true
}
