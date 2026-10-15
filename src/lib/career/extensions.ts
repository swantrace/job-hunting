import {
  type CareerDb,
  readCareerStateDocuments,
  writeCareerStateDocuments,
} from '../../db/career-state'
import type { DbExecutor } from '../../db/skill-queries'
import { applyExtensionFields, parseExtensionLines } from './form-input'
import { extensionObjectOrNull } from './json-schemas'

/**
 * Preserved extension fields for one career record live in `career_state`, keyed
 * by kind and stable key. These helpers give every editor the same ordinary
 * `key = value` control, so a preserved field is never only raw JSON and an
 * empty edit removes the field instead of leaving residue.
 */
export function storedRecordExtensions(
  executor: DbExecutor,
  kind: string,
  key: string,
): Record<string, unknown> | null {
  return extensionObjectOrNull(readCareerStateDocuments(executor).records[kind]?.[key])
}

export function saveRecordExtensions(
  executor: CareerDb,
  kind: string,
  key: string,
  text: string | undefined,
): boolean {
  const documents = readCareerStateDocuments(executor)
  const extension = parseExtensionLines(storedRecordExtensions(executor, kind, key), text)
  return writeCareerStateDocuments(executor, {
    records: applyExtensionFields(documents.records, kind, key, extension),
  })
}
