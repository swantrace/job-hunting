import { describe, expect, test } from 'bun:test'
import PizZip from 'pizzip'
import {
  baseResumeDirectoryName,
  baseResumeManifestFileName,
  baseResumeTextHash,
} from '../../src/lib/base-resumes'
import { careerDatasetFormat } from '../../src/lib/career/dataset'
import { decodeCareerUpload } from '../../src/lib/career/upload'
import {
  approvedBaseResumeManifest,
  approvedBaseResumeMarkdown,
  syntheticCareerDocuments,
  syntheticTaxonomy,
} from './fixtures'

/**
 * acceptance for the uploaded career source decoder. Everything is built
 * in memory from the synthetic fixtures: an upload never touches the filesystem,
 * and only the known career-document paths are ever read out of an archive.
 */

function zipOf(entries: Record<string, string>, prefix = ''): ArrayBuffer {
  const zip = new PizZip()
  for (const [name, content] of Object.entries(entries)) {
    zip.file(`${prefix}${name}`, content)
  }
  return zip.generate({ compression: 'DEFLATE', type: 'arraybuffer' }) as ArrayBuffer
}

function legacyDirectoryEntries(): Record<string, string> {
  const entries: Record<string, string> = {
    'skill-taxonomy.json': JSON.stringify(syntheticTaxonomy),
    [`${baseResumeDirectoryName}/${baseResumeManifestFileName}`]: JSON.stringify(
      approvedBaseResumeManifest(),
    ),
    [`${baseResumeDirectoryName}/fullstack.md`]: approvedBaseResumeMarkdown,
  }
  for (const [name, document] of Object.entries(syntheticCareerDocuments)) {
    entries[name] = JSON.stringify(document)
  }
  return entries
}

describe('career upload decoding', () => {
  test('decodes a career-dataset JSON upload into a parsed dataset', () => {
    const decoded = decodeCareerUpload(
      'career-dataset.json',
      new TextEncoder().encode(JSON.stringify({ format: careerDatasetFormat, schemaVersion: 1 }))
        .buffer as ArrayBuffer,
    )
    expect(decoded).toEqual({
      kind: 'dataset',
      json: { format: careerDatasetFormat, schemaVersion: 1 },
    })
  })

  test('rejects JSON that is not a career dataset', () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ schemaVersion: 4 }))
    expect(() => decodeCareerUpload('backup.json', bytes.buffer as ArrayBuffer)).toThrow(
      /not a "career-dataset" dataset/,
    )
  })

  test('rejects a file that is neither JSON nor a readable zip', () => {
    const bytes = new TextEncoder().encode('not a zip at all')
    // Content decides the format: without a ZIP signature the upload must parse
    // as a career dataset JSON, so this is reported as invalid JSON.
    expect(() => decodeCareerUpload('career-data.zip', bytes.buffer as ArrayBuffer)).toThrow(
      /not valid JSON/,
    )
  })

  test('reads a zipped legacy directory, including the approved Base Resume', () => {
    const decoded = decodeCareerUpload(
      'career-data.zip',
      zipOf(legacyDirectoryEntries(), 'career-data/'),
    )
    if (decoded.kind !== 'directory') throw new Error('expected a directory upload')
    for (const name of Object.keys(syntheticCareerDocuments)) {
      expect(decoded.files[name]).toBeString()
    }
    expect(decoded.files['skill-taxonomy.json']).toContain('languages-web')
    expect(decoded.files[`${baseResumeDirectoryName}/fullstack.md`]).toBe(
      approvedBaseResumeMarkdown,
    )
    // The recorded manifest hash matches the uploaded Markdown, so the import can
    // validate it rather than trusting the archive.
    expect(approvedBaseResumeManifest().resumes[0]?.sha256).toBe(
      baseResumeTextHash(approvedBaseResumeMarkdown),
    )
  })

  test('ignores unrelated and unsafe archive entries', () => {
    const entries = {
      ...legacyDirectoryEntries(),
      'notes.txt': 'ignored',
      'career-data/extra/private.json': '{"ignored": true}',
    }
    const decoded = decodeCareerUpload('career-data.zip', zipOf(entries))
    if (decoded.kind !== 'directory') throw new Error('expected a directory upload')
    expect(Object.keys(decoded.files).sort()).toEqual(
      [
        ...Object.keys(syntheticCareerDocuments),
        'skill-taxonomy.json',
        `${baseResumeDirectoryName}/${baseResumeManifestFileName}`,
        `${baseResumeDirectoryName}/fullstack.md`,
      ].sort(),
    )
    expect(decoded.files['notes.txt']).toBeUndefined()
  })

  test('refuses an archive entry that climbs out of the archive', () => {
    const zip = new PizZip()
    zip.file('../escape.json', '{}')
    zip.file('candidate.json', '{}')
    const bytes = zip.generate({ type: 'arraybuffer' }) as ArrayBuffer
    expect(() => decodeCareerUpload('career-data.zip', bytes)).toThrow(/unsafe path/)
  })

  test('refuses an oversized upload before reading it', () => {
    const oversized = new ArrayBuffer(33 * 1024 * 1024)
    expect(() => decodeCareerUpload('career-dataset.json', oversized)).toThrow(/32 MB import limit/)
  })
})
