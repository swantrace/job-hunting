import { and, asc, eq, ne } from 'drizzle-orm'
import { baseResumeTextHash, isEmptyBaseResume } from '../lib/career/base-resumes'
import { nowISO, todayISO } from '../lib/date'
import { type CareerDb, CareerReferenceError, type CareerWriteResult } from './career-shared'
import { db } from './client'
import { type CareerBaseResume, careerBaseResumes, careerDirections } from './schema'
import type { DbExecutor } from './skill-queries'

/**
 * Immutable Base Resume versions. A version's `markdown` and `content_hash` are
 * written once at creation and can never be rewritten; editing produces a new
 * draft. At most one version per direction is `approved` (enforced by a partial
 * unique index), and the previously approved version becomes `superseded` in
 * the same transaction that approves the replacement, so the selected approved
 * version never silently disappears.
 */

export type BaseResumeStatus = 'draft' | 'approved' | 'superseded'
export type BaseResumeListOptions = { status?: BaseResumeStatus }

export type BaseResumeDraftInput = {
  directionKey: string
  version: string
  markdown: string
}

export type BaseResumeApproval = {
  id: number
  approvedAt: string
  contentHash: string
  changed: boolean
  revision: number
  supersededId: number | null
}

/** Rejects any attempt to change a version's Markdown or its content hash. */
export function assertBaseResumeImmutable(
  existing: Pick<CareerBaseResume, 'id' | 'markdown' | 'contentHash'>,
  proposed: { markdown?: string; contentHash?: string },
): void {
  const changesMarkdown = proposed.markdown !== undefined && proposed.markdown !== existing.markdown
  const changesHash =
    proposed.contentHash !== undefined && proposed.contentHash !== existing.contentHash
  if (changesMarkdown || changesHash) {
    throw new Error(
      `Base Resume version ${existing.id} is immutable: markdown and content_hash cannot change after it is created.`,
    )
  }
}

function requireVersion(tx: CareerDb, id: number): CareerBaseResume {
  const row = tx.select().from(careerBaseResumes).where(eq(careerBaseResumes.id, id)).get()
  if (!row) throw new CareerReferenceError(`Base Resume version ${id} does not exist.`)
  return row
}

function requireDirection(tx: CareerDb, key: string) {
  const row = tx.select().from(careerDirections).where(eq(careerDirections.key, key)).get()
  if (!row) throw new CareerReferenceError(`Direction "${key}" does not exist.`)
  if (row.retiredAt !== null) throw new CareerReferenceError(`Direction "${key}" is retired.`)
  return row
}

/** Applies a status change through the immutability guard. */
function updateVersion(
  tx: CareerDb,
  existing: CareerBaseResume,
  changes: {
    status?: BaseResumeStatus
    approvedAt?: string | null
    revision: number
    markdown?: string
    contentHash?: string
  },
): void {
  assertBaseResumeImmutable(existing, changes)
  tx.update(careerBaseResumes)
    .set({ ...changes, updatedAt: nowISO() })
    .where(eq(careerBaseResumes.id, existing.id))
    .run()
}

export function listBaseResumeVersions(
  executor: DbExecutor,
  directionKey: string,
  options: BaseResumeListOptions = {},
): CareerBaseResume[] {
  return executor
    .select()
    .from(careerBaseResumes)
    .where(
      options.status === undefined
        ? eq(careerBaseResumes.directionKey, directionKey)
        : and(
            eq(careerBaseResumes.directionKey, directionKey),
            eq(careerBaseResumes.status, options.status),
          ),
    )
    .orderBy(asc(careerBaseResumes.id))
    .all()
}

export function readBaseResumeVersion(executor: DbExecutor, id: number): CareerBaseResume | null {
  return executor.select().from(careerBaseResumes).where(eq(careerBaseResumes.id, id)).get() ?? null
}

/** Every version, grouped deterministically by direction, for the management view. */
export function listAllBaseResumeVersions(executor: DbExecutor = db): CareerBaseResume[] {
  return executor
    .select()
    .from(careerBaseResumes)
    .orderBy(asc(careerBaseResumes.directionKey), asc(careerBaseResumes.id))
    .all()
}

export function selectedApprovedBaseResume(
  executor: DbExecutor,
  directionKey: string,
): CareerBaseResume | null {
  return (
    executor
      .select()
      .from(careerBaseResumes)
      .where(
        and(
          eq(careerBaseResumes.directionKey, directionKey),
          eq(careerBaseResumes.status, 'approved'),
        ),
      )
      .orderBy(asc(careerBaseResumes.id))
      .get() ?? null
  )
}

export function createBaseResumeDraft(
  executor: CareerDb,
  input: BaseResumeDraftInput,
): CareerBaseResume {
  return executor.transaction((tx) => {
    requireDirection(tx, input.directionKey)
    const version = input.version.trim()
    if (version === '') throw new CareerReferenceError('Base Resume version is required.')
    if (isEmptyBaseResume(input.markdown)) {
      throw new CareerReferenceError(
        `Base Resume version "${version}" for direction "${input.directionKey}" is empty.`,
      )
    }
    const existing = tx
      .select()
      .from(careerBaseResumes)
      .where(
        and(
          eq(careerBaseResumes.directionKey, input.directionKey),
          eq(careerBaseResumes.version, version),
        ),
      )
      .get()
    if (existing) {
      throw new CareerReferenceError(
        `Base Resume version "${version}" already exists for direction "${input.directionKey}".`,
      )
    }
    const contentHash = baseResumeTextHash(input.markdown)
    const now = nowISO()
    const inserted = tx
      .insert(careerBaseResumes)
      .values({
        directionKey: input.directionKey,
        version,
        status: 'draft',
        markdown: input.markdown,
        contentHash,
        approvedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get()
    return inserted
  })
}

export function approveBaseResumeVersion(
  executor: CareerDb,
  id: number,
  options: { approvedAt?: string } = {},
): BaseResumeApproval {
  return executor.transaction((tx) => {
    const target = requireVersion(tx, id)
    const approvedAt = options.approvedAt ?? todayISO()
    const previous =
      tx
        .select()
        .from(careerBaseResumes)
        .where(
          and(
            eq(careerBaseResumes.directionKey, target.directionKey),
            eq(careerBaseResumes.status, 'approved'),
            ne(careerBaseResumes.id, target.id),
          ),
        )
        .get() ?? null

    const targetAlreadySelected = target.status === 'approved' && target.approvedAt === approvedAt
    if (targetAlreadySelected && previous === null) {
      return {
        id: target.id,
        approvedAt,
        contentHash: target.contentHash,
        changed: false,
        revision: target.revision,
        supersededId: null,
      }
    }

    if (previous) {
      updateVersion(tx, previous, {
        status: 'superseded',
        revision: previous.revision + 1,
      })
    }
    const revision = targetAlreadySelected ? target.revision : target.revision + 1
    if (!targetAlreadySelected) {
      updateVersion(tx, target, { status: 'approved', approvedAt, revision })
    }
    return {
      id: target.id,
      approvedAt,
      contentHash: target.contentHash,
      changed: true,
      revision,
      supersededId: previous?.id ?? null,
    }
  })
}

export function supersedeBaseResumeVersion(executor: CareerDb, id: number): CareerWriteResult {
  return executor.transaction((tx) => {
    const existing = requireVersion(tx, id)
    if (existing.status === 'superseded') {
      return { id, changed: false, revision: existing.revision }
    }
    const revision = existing.revision + 1
    updateVersion(tx, existing, { status: 'superseded', revision })
    return { id, changed: true, revision }
  })
}
