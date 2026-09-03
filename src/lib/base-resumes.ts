import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'
import { isISODate, todayISO } from './date'

/**
 * Sole authority for approved Base Resume Markdown. A Base Resume is a private
 * editorial prior; canonical Career Data remains the factual authority. Approved
 * files live at `<career-data>/base-resumes/<direction>.md` with a private
 * `manifest.json` that records the direction, version label, approval date, and
 * normalized-text SHA-256 hash so old documents stay reproducible after edits.
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
 * Resolves the Base Resume directory: an explicit `CAREER_BASE_RESUMES_DIR`, or
 * `<CAREER_DATA_DIR>/base-resumes`, or `./career-data/base-resumes`.
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
  /** Hash recorded in the manifest at approval time. */
  approvedSha256: string
  /** Current normalized Markdown text. */
  text: string
  /** Hash of the current normalized text. */
  sha256: string
  empty: boolean
  /** True when the file no longer matches the approved hash. */
  stale: boolean
}

/**
 * Loads one approved Base Resume. Missing a resume for a direction disables
 * generation for that direction only; it never silently falls back to a blank
 * resume. A present-but-empty file is a hard error rather than an empty source.
 */
export function loadApprovedBaseResume(
  directory: string,
  direction: string,
  knownDirectionIds: ReadonlySet<string> = new Set(),
): ApprovedBaseResume | null {
  const manifest = loadBaseResumeManifest(directory, knownDirectionIds)
  if (!manifest) return null
  const entry = manifest.resumes.find((item) => item.direction === direction)
  if (!entry) return null
  const path = resolve(directory, entry.fileName)
  if (!existsSync(path))
    throw new Error(`Base Resume file "${entry.fileName}" is missing for direction "${direction}".`)
  const raw = readFileSync(path, 'utf8')
  const sha256 = baseResumeTextHash(raw)
  if (isEmptyBaseResume(raw))
    throw new Error(`Base Resume file "${entry.fileName}" for direction "${direction}" is empty.`)
  return {
    direction: entry.direction,
    fileName: entry.fileName,
    version: entry.version,
    approvedAt: entry.approvedAt,
    approvedSha256: entry.sha256,
    text: normalizeBaseResumeText(raw),
    sha256,
    empty: false,
    stale: sha256 !== entry.sha256,
  }
}

export function listApprovedBaseResumes(
  directory: string,
  knownDirectionIds: ReadonlySet<string> = new Set(),
): ApprovedBaseResume[] {
  const manifest = loadBaseResumeManifest(directory, knownDirectionIds)
  if (!manifest) return []
  return manifest.resumes
    .map((entry) => loadApprovedBaseResume(directory, entry.direction, knownDirectionIds))
    .filter((resume): resume is ApprovedBaseResume => resume !== null)
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
 * direction. This is the only write path into the Base Resume store; the
 * production app never extracts PDFs. The normalized text is written to
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
