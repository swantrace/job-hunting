import { createHash } from 'node:crypto'

/**
 * Deterministic canonical serialization for input hashes.
 *
 * Stability guarantees required by the versioned workflow:
 * - object keys are sorted before serialization, so key insertion order and
 *   SQLite row iteration order never change the serialized bytes;
 * - array order is preserved, so semantically ordered data (requirements by
 *   sequence, skills by id) stays stable as long as the caller sorts it;
 * - `undefined` normalizes to `null`, matching JSON.stringify semantics.
 *
 * Callers remain responsible for deterministically ordering arrays that carry
 * semantic order before handing them to this module.
 */
function normalize(value: unknown): unknown {
  if (value === undefined) return null
  if (Array.isArray(value)) return value.map(normalize)
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort())
      result[key] = normalize((value as Record<string, unknown>)[key])
    return result
  }
  return value
}

export function canonicalSerialize(value: unknown): string {
  return JSON.stringify(normalize(value))
}

export function canonicalHash(value: unknown): string {
  return createHash('sha256').update(canonicalSerialize(value)).digest('hex')
}
