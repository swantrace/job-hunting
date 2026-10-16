import { canonicalHash } from '../canonical-hash'

export const applicationFactFields = [
  'jobTitle',
  'companyName',
  'location',
  'url',
  'postedDate',
  'salary',
  'applicationSource',
  'direction',
] as const
export type FactField = (typeof applicationFactFields)[number]
type Fact = {
  source: 'user' | 'capture' | 'ai' | 'unknown'
  confirmed: boolean
  value: unknown
  aiValue?: unknown
}
export type FieldProvenance = { version: 1; fields: Partial<Record<FactField, Fact>> }

export function readProvenance(json: string | null | undefined): FieldProvenance {
  if (!json) return { version: 1, fields: {} }
  try {
    const parsed = JSON.parse(json)
    if (parsed?.version === 1 && parsed.fields && typeof parsed.fields === 'object') return parsed
  } catch {
    /* Legacy values are protected by default. */
  }
  return { version: 1, fields: {} }
}

export function userProvenance(
  values: Partial<Record<FactField, unknown>>,
  previous?: string | null,
) {
  const provenance = readProvenance(previous)
  for (const field of applicationFactFields) {
    if (Object.hasOwn(values, field))
      provenance.fields[field] = { source: 'user', confirmed: true, value: values[field] ?? null }
  }
  return JSON.stringify(provenance)
}

export function captureProvenance(values: Partial<Record<FactField, unknown>>) {
  return JSON.stringify({
    version: 1,
    fields: Object.fromEntries(
      applicationFactFields.map((field) => [
        field,
        {
          source: values[field] == null ? 'unknown' : 'capture',
          confirmed: false,
          value: values[field] ?? null,
        },
      ]),
    ),
  })
}

/** Legacy values and explicit clears are protected; captured facts win over AI. */
export function adoptAiFacts(json: string | null, values: Partial<Record<FactField, unknown>>) {
  const provenance = readProvenance(json)
  const updates: Partial<Record<FactField, unknown>> = {}
  for (const [field, value] of Object.entries(values) as [FactField, unknown][]) {
    if (value == null || value === '') continue
    const fact = provenance.fields[field]
    if (!fact || fact.confirmed) continue
    fact.aiValue = value
    if (fact.source === 'capture') continue
    fact.source = 'ai'
    fact.value = value
    updates[field] = value
  }
  return { updates, json: JSON.stringify(provenance) }
}

export function metadataConflictCount(json: string | null) {
  return Object.values(readProvenance(json).fields).filter(
    (f) => f && f.aiValue != null && canonicalHash(f.value) !== canonicalHash(f.aiValue),
  ).length
}
