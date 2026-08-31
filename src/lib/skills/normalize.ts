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
