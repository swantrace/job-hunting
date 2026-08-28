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
