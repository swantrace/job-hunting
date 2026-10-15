import PizZip from 'pizzip'
import { baseResumeDirectoryName, baseResumeManifestFileName } from '../base-resumes'
import { careerImportDocumentFiles, careerImportTaxonomyFile } from '../career-import'
import { careerDatasetFormat, careerDatasetSchemaVersion } from './dataset'

/**
 * Decodes an uploaded career source into an inert in-memory file map.
 *
 * Two uploads are supported and are distinguished by content, never by the file
 * name alone: a `career-dataset` JSON document, or a zip archive of a legacy
 * career directory. An archive is only read (never extracted to disk), and only
 * the entries the importer actually understands are kept — the archive can
 * therefore never place a file anywhere, nor smuggle in content the importer
 * would execute.
 */

/** Uploaded archives are bounded so a single request cannot exhaust memory. */
export const maxUploadedDatasets = 32 * 1024 * 1024
const maxArchiveEntries = 5000

export type DecodedCareerUpload =
  | { kind: 'dataset'; json: unknown }
  | { kind: 'directory'; files: Record<string, string | null> }

export class CareerUploadError extends Error {}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** Rejects archive entry names that are absolute or climb out of the archive. */
function assertSafeEntryName(name: string): void {
  const normalized = name.replace(/\\/g, '/').replace(/^\/+/, '')
  if (normalized === '' || normalized.split('/').some((segment) => segment === '..')) {
    throw new CareerUploadError('The uploaded archive contains an unsafe path.')
  }
}

/**
 * Maps archive entry names onto the importer's known relative paths. An entry
 * matches when its path equals the known path or ends with `/<known path>`, so
 * `candidate.json` and `career-data/candidate.json` both work while unrelated
 * entries are ignored.
 */
function matchKnownPath(entryNames: string[], knownPath: string): string | null {
  const exact = entryNames.filter((name) => name === knownPath)
  const nested = entryNames.filter((name) => name.endsWith(`/${knownPath}`))
  const candidates = [...exact, ...nested].sort((left, right) => left.length - right.length)
  return candidates[0] ?? null
}

function decodeArchiveEntry(zip: PizZip, name: string): string | null {
  const entry = zip.file(name)
  if (!entry) return null
  return entry.asText()
}

function decodeDirectoryArchive(bytes: ArrayBuffer): Record<string, string | null> {
  let zip: PizZip
  try {
    zip = new PizZip(bytes)
  } catch {
    throw new CareerUploadError('The uploaded file is neither a career dataset nor a readable zip.')
  }
  const entryNames = Object.keys(zip.files).filter((name) => !zip.files[name]?.dir)
  if (entryNames.length > maxArchiveEntries) {
    throw new CareerUploadError('The uploaded archive contains too many entries.')
  }
  for (const name of entryNames) assertSafeEntryName(name)

  const files: Record<string, string | null> = {}
  for (const file of [...careerImportDocumentFiles, careerImportTaxonomyFile]) {
    const entry = matchKnownPath(entryNames, file)
    if (entry) files[file] = decodeArchiveEntry(zip, entry)
  }

  const manifestEntry = matchKnownPath(
    entryNames,
    `${baseResumeDirectoryName}/${baseResumeManifestFileName}`,
  )
  if (manifestEntry) {
    const manifestText = decodeArchiveEntry(zip, manifestEntry)
    files[`${baseResumeDirectoryName}/${baseResumeManifestFileName}`] = manifestText
    const manifest = parseManifestEntryNames(manifestText)
    for (const fileName of manifest) {
      const baseResumeEntry = matchKnownPath(entryNames, `${baseResumeDirectoryName}/${fileName}`)
      files[`${baseResumeDirectoryName}/${fileName}`] = baseResumeEntry
        ? decodeArchiveEntry(zip, baseResumeEntry)
        : null
    }
  }
  return files
}

/** Reads the declared Base Resume file names from a manifest without trusting paths. */
function parseManifestEntryNames(manifestText: string | null): string[] {
  if (!manifestText) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(manifestText)
  } catch {
    return []
  }
  const resumes = (parsed as { resumes?: unknown } | null)?.resumes
  if (!Array.isArray(resumes)) return []
  return resumes
    .map((entry) => text((entry as { fileName?: unknown } | null)?.fileName))
    .filter(
      (fileName) =>
        fileName !== '' &&
        fileName.length <= 200 &&
        !fileName.startsWith('/') &&
        !fileName.split('/').some((segment) => segment === '..'),
    )
}

/** ZIP local-file header or empty-archive signature. */
function isZipArchive(bytes: ArrayBuffer): boolean {
  const header = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength))
  return (
    header.length >= 4 &&
    header[0] === 0x50 &&
    header[1] === 0x4b &&
    (header[2] === 0x03 || header[2] === 0x05 || header[2] === 0x07)
  )
}

/**
 * Decodes one uploaded file. The content, not the extension, decides: a ZIP
 * archive becomes a legacy directory file map, and anything else must parse as a
 * `career-dataset` document. The confirm step re-reads the same bytes without a
 * file name, so detection can never depend on what the browser called the upload.
 */
export function decodeCareerUpload(fileName: string, bytes: ArrayBuffer): DecodedCareerUpload {
  void fileName
  if (bytes.byteLength > maxUploadedDatasets) {
    throw new CareerUploadError('The uploaded file is larger than the 32 MB import limit.')
  }
  if (isZipArchive(bytes)) return { kind: 'directory', files: decodeDirectoryArchive(bytes) }
  let json: unknown
  try {
    json = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new CareerUploadError('The uploaded file is not valid JSON.')
  }
  const record = json && typeof json === 'object' ? (json as Record<string, unknown>) : null
  if (record?.format !== careerDatasetFormat) {
    throw new CareerUploadError(
      `The uploaded JSON is not a "${careerDatasetFormat}" dataset (schema version ${careerDatasetSchemaVersion}). Upload a career dataset or a zip of the legacy career directory.`,
    )
  }
  return { kind: 'dataset', json }
}
