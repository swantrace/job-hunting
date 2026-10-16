/**
 * Deterministic skill alias normalization.
 *
 * Normalization applies Unicode NFKC folding, trims, lowercases, and collapses
 * internal whitespace. It deliberately does not strip punctuation that changes
 * technical meaning: `.NET`, `C++`, and `C#` remain distinct from `net` and `C`.
 * Semantic equivalence is expressed through explicit aliases, never fuzzy
 * string rewriting.
 */
export function normalizeSkillAlias(value: string) {
  return value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Keep technical punctuation and non-Latin names, but reject punctuation-only fragments. */
export function isMeaningfulSkillTerm(value: string) {
  return /[\p{L}\p{N}]/u.test(value.normalize('NFKC'))
}

/**
 * Splits a conjunctive composite term ("JavaScript and TypeScript",
 * "HTML/CSS", "Go, Rust") into its parts. Only the conjunctive separators that
 * the catalog fixtures use are split; disjunctive wording ("or") is left alone
 * because it does not claim every part. A term without a separator returns an
 * empty list so callers can treat it as a single term. Splitting is
 * deterministic and never rewrites the parts themselves.
 */
export function splitCompositeSkillTerm(value: string): string[] {
  const parts = value
    .split(/\s*(?:,|\/|&|(?<!\+)\+(?!\+)| and | plus )\s*/i)
    .map((part) => part.trim())
    .filter((part) => part !== '')
  const distinct = new Map<string, string>()
  for (const part of parts) distinct.set(normalizeSkillAlias(part), part)
  return distinct.size > 1 ? [...distinct.values()] : []
}

/**
 * Creates a stable machine identity for newly discovered skills. Technical
 * punctuation is expressed in words where it changes meaning; all remaining
 * separators become lowercase kebab-case. Existing keys are never regenerated
 * when a display label changes.
 */
export function canonicalSkillKey(value: string) {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\+\+/g, ' plus plus ')
    .replace(/#/g, ' sharp ')
    .replace(/&/g, ' and ')
    .replace(/\./g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
