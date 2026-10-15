import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'
import { listBaseResumeVersions, selectedApprovedBaseResume } from '../db/career-base-resumes'
import { listCareerDirections } from '../db/career-directions'
import { db } from '../db/client'
import type { CareerBaseResume } from '../db/schema'
import type { DbExecutor } from '../db/skill-queries'
import { isISODate, todayISO } from './date'

/**
 * Byte-level authority for Base Resume Markdown hashing, plus the import/export
 * filesystem helpers. The *runtime* reading path (`loadApprovedBaseResume`,
 * `listApprovedBaseResumes`) comes from `career_base_resumes`; the filesystem
 * functions below are import-only: the importer and the Base Resume forms keep
 * them exported.
 *
 * A Base Resume is a private editorial prior; canonical Career Data remains the
 * factual authority. Approved files live at
 * `<career-data>/base-resumes/<direction>.md` with a private `manifest.json`
 * that records the direction, version label, approval date, and normalized-text
 * SHA-256 hash so old documents stay reproducible after edits.
 */

export const baseResumeManifestFileName = 'manifest.json'
export const baseResumeDirectoryName = 'base-resumes'

const directionIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const sha256Pattern = /^[0-9a-f]{64}$/

export const baseResumeManifestEntrySchema = z
  .object({
    direction: directionIdSchema,
    fileName: z.string().trim().min(1).max(200),
    version: z.string().trim().min(1).max(100),
    approvedAt: z.string().refine(isISODate, 'Use a valid YYYY-MM-DD approval date'),
    sha256: z.string().regex(sha256Pattern, 'sha256 must be a 64-character lowercase hex digest'),
  })
  .strict()

export const baseResumeManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    lastUpdated: z.string().refine(isISODate, 'Use a valid YYYY-MM-DD last-updated date'),
    resumes: z.array(baseResumeManifestEntrySchema).min(1),
  })
  .strict()

export type BaseResumeManifestEntry = z.infer<typeof baseResumeManifestEntrySchema>
export type BaseResumeManifest = z.infer<typeof baseResumeManifestSchema>

/**
 * Resolves the import-only Base Resume directory: an explicit
 * `CAREER_BASE_RESUMES_DIR`, or `<CAREER_DATA_DIR>/base-resumes`, or
 * `./career-data/base-resumes`. Runtime code never calls this.
 */
export function baseResumesDirectory(
  env: Record<string, string | undefined> = process.env,
): string {
  const configured = env.CAREER_BASE_RESUMES_DIR?.trim()
  if (configured) return resolve(configured)
  const careerDataDir = env.CAREER_DATA_DIR?.trim()
  if (careerDataDir) return resolve(careerDataDir, baseResumeDirectoryName)
  return resolve(process.cwd(), 'career-data', baseResumeDirectoryName)
}

/**
 * Normalizes Markdown for hashing and comparison: CRLF/CR become LF and outer
 * whitespace is trimmed. Line-internal spacing is preserved so wording edits
 * still change the digest.
 */
export function normalizeBaseResumeText(text: string): string {
  return text.replace(/\r\n?/g, '\n').trim()
}

export function baseResumeTextHash(text: string): string {
  return createHash('sha256').update(normalizeBaseResumeText(text)).digest('hex')
}

export function isEmptyBaseResume(text: string): boolean {
  return normalizeBaseResumeText(text).length === 0
}

/**
 * Validates manifest shape plus cross-field rules: directions are unique, the
 * file name matches `<direction>.md`, and every direction is defined in
 * preferences.directionDefinitions (when a known direction set is supplied).
 */
export function validateBaseResumeManifest(
  manifest: BaseResumeManifest,
  knownDirectionIds: ReadonlySet<string> = new Set(),
): BaseResumeManifest {
  const seen = new Set<string>()
  for (const entry of manifest.resumes) {
    if (seen.has(entry.direction))
      throw new Error(`Base Resume manifest contains duplicate direction "${entry.direction}".`)
    seen.add(entry.direction)
    if (entry.fileName !== `${entry.direction}.md`)
      throw new Error(
        `Base Resume "${entry.direction}" file name must be "${entry.direction}.md", received "${entry.fileName}".`,
      )
    if (knownDirectionIds.size > 0 && !knownDirectionIds.has(entry.direction))
      throw new Error(
        `Base Resume direction "${entry.direction}" is not defined in preferences.directionDefinitions.`,
      )
  }
  return manifest
}

export function parseBaseResumeManifest(
  json: unknown,
  knownDirectionIds: ReadonlySet<string> = new Set(),
): BaseResumeManifest {
  return validateBaseResumeManifest(baseResumeManifestSchema.parse(json), knownDirectionIds)
}

/** Import-only manifest reader. */
export function loadBaseResumeManifest(
  directory: string,
  knownDirectionIds: ReadonlySet<string> = new Set(),
): BaseResumeManifest | null {
  const path = resolve(directory, baseResumeManifestFileName)
  if (!existsSync(path)) return null
  return parseBaseResumeManifest(JSON.parse(readFileSync(path, 'utf8')), knownDirectionIds)
}

export type ApprovedBaseResume = {
  direction: string
  fileName: string
  version: string
  approvedAt: string
  /** Hash recorded when the version was approved. */
  approvedSha256: string
  /** Current normalized Markdown text. */
  text: string
  /** Hash of the current normalized text. */
  sha256: string
  empty: boolean
  /** True when the stored Markdown no longer matches the approved hash. */
  stale: boolean
}

/**
 * Projects one stored Base Resume version onto the approved-resume shape that
 * generation, snapshots and exports consume. Shared so a database-backed export
 * never re-derives the text/hash/stale rules by hand.
 */
export function toApprovedBaseResume(row: CareerBaseResume): ApprovedBaseResume {
  const sha256 = baseResumeTextHash(row.markdown)
  return {
    direction: row.directionKey,
    fileName: `${row.directionKey}.md`,
    version: row.version,
    approvedAt: row.approvedAt ?? '',
    approvedSha256: row.contentHash,
    text: normalizeBaseResumeText(row.markdown),
    sha256,
    empty: isEmptyBaseResume(row.markdown),
    stale: sha256 !== row.contentHash,
  }
}

/**
 * Loads the selected approved Base Resume version for a direction from the
 * database. Missing a resume for a direction disables generation for that
 * direction only; it never silently falls back to a blank resume.
 */
export function loadApprovedBaseResume(
  direction: string,
  knownDirectionIds: ReadonlySet<string> = new Set(),
  executor: DbExecutor = db,
): ApprovedBaseResume | null {
  if (knownDirectionIds.size > 0 && !knownDirectionIds.has(direction)) return null
  const row = selectedApprovedBaseResume(executor, direction)
  return row ? toApprovedBaseResume(row) : null
}

export function listApprovedBaseResumes(
  knownDirectionIds: ReadonlySet<string> = new Set(),
  executor: DbExecutor = db,
): ApprovedBaseResume[] {
  return listCareerDirections(executor)
    .filter((direction) => knownDirectionIds.size === 0 || knownDirectionIds.has(direction.key))
    .flatMap((direction) => {
      const versions = listBaseResumeVersions(executor, direction.key, { status: 'approved' })
      return versions.map(toApprovedBaseResume)
    })
}

export type FrozenBaseResumeSource = {
  direction: string
  version: string
  approvedAt: string
  sha256: string
  text: string
}

/**
 * The exact Base Resume context frozen into a generation snapshot, so old
 * documents stay reproducible after later edits. Never a local filesystem path.
 */
export function frozenBaseResumeSource(resume: ApprovedBaseResume): FrozenBaseResumeSource {
  return {
    direction: resume.direction,
    version: resume.version,
    approvedAt: resume.approvedAt,
    sha256: resume.sha256,
    text: resume.text,
  }
}

function serializeManifest(manifest: BaseResumeManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`
}

/** Returns a copy of the manifest with `entry` upserted by direction. */
export function upsertBaseResumeManifestEntry(
  manifest: BaseResumeManifest,
  entry: BaseResumeManifestEntry,
): BaseResumeManifest {
  const resumes = manifest.resumes.filter((item) => item.direction !== entry.direction)
  resumes.push(entry)
  resumes.sort((left, right) => left.direction.localeCompare(right.direction))
  return { schemaVersion: 1, lastUpdated: entry.approvedAt, resumes }
}

/**
 * Approves (imports) one Base Resume as the private Markdown source for a
 * direction. This is the only filesystem write path into the Base Resume store;
 * the production app never extracts PDFs. The normalized text is written to
 * `<direction>.md` and the manifest entry records its hash and approval date.
 */
export function approveBaseResume(
  directory: string,
  direction: string,
  text: string,
  options: { version: string; approvedAt?: string; knownDirectionIds?: ReadonlySet<string> },
): ApprovedBaseResume {
  const knownDirectionIds = options.knownDirectionIds ?? new Set()
  if (knownDirectionIds.size > 0 && !knownDirectionIds.has(direction))
    throw new Error(`Direction "${direction}" is not defined in preferences.directionDefinitions.`)
  const normalized = normalizeBaseResumeText(text)
  if (isEmptyBaseResume(normalized))
    throw new Error(`Base Resume for direction "${direction}" is empty.`)
  const approvedAt = options.approvedAt ?? todayISO()
  const entry: BaseResumeManifestEntry = {
    direction,
    fileName: `${direction}.md`,
    version: options.version.trim(),
    approvedAt,
    sha256: baseResumeTextHash(normalized),
  }
  const manifest = loadBaseResumeManifest(directory, knownDirectionIds) ?? {
    schemaVersion: 1 as const,
    lastUpdated: approvedAt,
    resumes: [],
  }
  const updated = upsertBaseResumeManifestEntry(manifest, entry)
  mkdirSync(directory, { recursive: true })
  writeFileSync(resolve(directory, entry.fileName), `${normalized}\n`)
  writeFileSync(resolve(directory, baseResumeManifestFileName), serializeManifest(updated))
  return {
    direction: entry.direction,
    fileName: entry.fileName,
    version: entry.version,
    approvedAt: entry.approvedAt,
    approvedSha256: entry.sha256,
    text: normalized,
    sha256: entry.sha256,
    empty: false,
    stale: false,
  }
}
