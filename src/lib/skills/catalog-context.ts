import { and, asc, eq, isNull } from 'drizzle-orm'
import { db } from '../../db/client'
import { skillAliases, skills } from '../../db/schema'
import type { DbExecutor } from '../../db/skill-queries'
import { canonicalHash } from '../canonical-hash'
import { canonicalSkillKey, normalizeSkillAlias, splitCompositeSkillTerm } from './normalize'

/**
 * Bounded catalog context for one Job Analysis run.
 *
 * The paid extraction is never given (and never resolves against) the whole
 * catalog. This module retrieves a small, deterministic list of approved,
 * unmerged catalog entries from the raw posting text — and, optionally, from
 * already-extracted terms: the entries a word, bigram, composite part, exact
 * key, normalized display name or curated alias claims, plus at most
 * {@link catalogContextCategoryCandidateLimit} extra entries from the same
 * categories so the model can still propose a nearby key. The returned
 * `fingerprint` hashes exactly the supplied entries, so the same posting always
 * produces the same frozen snapshot and a forged key cannot name an entry that
 * was not supplied.
 *
 * An empty catalog yields an empty context, never an error.
 */

export type CatalogContextEntry = {
  key: string
  name: string
  category: string | null
  aliases: string[]
}

export type CatalogContext = {
  entries: CatalogContextEntry[]
  fingerprint: string
  /** True when the category-candidate cap dropped entries from the context. */
  truncated: boolean
}

/**
 * Documented cap on extra same-category candidates beyond the entries the
 * supplied terms already claim. Small enough that a run never ships the whole
 * catalog, large enough to offer the model a nearby proposal.
 */
export const catalogContextCategoryCandidateLimit = 8

/** Normalized names a single catalog entry answers to. */
function claimedTerms(entry: CatalogContextEntry): Set<string> {
  const claimed = new Set<string>([
    normalizeSkillAlias(entry.key),
    canonicalSkillKey(entry.key),
    normalizeSkillAlias(entry.name),
    canonicalSkillKey(entry.name),
  ])
  for (const phrase of [entry.name, ...entry.aliases]) {
    for (const part of [phrase, ...splitCompositeSkillTerm(phrase)]) {
      claimed.add(normalizeSkillAlias(part))
      claimed.add(canonicalSkillKey(part))
    }
  }
  return claimed
}

function normalizedQueryTerms(terms: readonly string[] = []): Set<string> {
  const normalized = new Set<string>()
  for (const term of terms) {
    const raw = term.trim()
    if (raw === '') continue
    for (const part of [raw, ...splitCompositeSkillTerm(raw)]) {
      normalized.add(normalizeSkillAlias(part))
      normalized.add(canonicalSkillKey(part))
    }
  }
  return normalized
}

/**
 * Sentence punctuation trimmed from a raw-text token's edges. Technical
 * punctuation that changes meaning (`+`, `#`, and a `.` inside a token such as
 * `Node.js` or `.NET`) is preserved.
 */
function cleanTextToken(token: string): string {
  return token
    .replace(/^[("'“”‘’[\]{}]+/, '')
    .replace(/[),;:!?"'“”‘’[\]{}]+$/, '')
    .replace(/\.+$/, '')
}

/**
 * Deterministic retrieval terms from raw posting text: the normalized form and
 * the canonical key form of every word, every bigram, and every composite part
 * of a token. No fuzzy matching, no embeddings and no model call: only exact
 * normalized wording can retrieve a catalog entry.
 */
export function catalogTermsFromText(text: string): string[] {
  const tokens: string[] = []
  for (const rawToken of text.split(/\s+/)) {
    const token = cleanTextToken(rawToken)
    if (token === '') continue
    const parts = splitCompositeSkillTerm(token)
    for (const part of parts.length > 0 ? parts : [token]) tokens.push(part)
  }

  const terms = new Set<string>()
  for (const [index, token] of tokens.entries()) {
    const phrases = [token]
    const next = tokens[index + 1]
    if (next) phrases.push(`${token} ${next}`)
    for (const phrase of phrases) {
      terms.add(normalizeSkillAlias(phrase))
      terms.add(canonicalSkillKey(phrase))
    }
  }
  return [...terms]
}

function entryClaims(entry: CatalogContextEntry, queryTerms: ReadonlySet<string>): boolean {
  const claimed = claimedTerms(entry)
  for (const term of queryTerms) if (claimed.has(term)) return true
  return false
}

export type CatalogContextInput = {
  /**
   * Raw posting text. Catalog entries whose key, normalized display name or
   * curated alias exactly matches a word, bigram or composite part of the text
   * are retrieved. This is the retrieval identity a paid run is frozen against.
   */
  text?: string
  /** Already-extracted terms; additional exact claims for the same selection. */
  terms?: readonly string[]
}

/**
 * Selects the bounded context for one extraction. Entries are sorted by key so
 * the context, and therefore its fingerprint, never depend on the order of the
 * words in the posting.
 */
export function buildCatalogContext(
  executor: DbExecutor = db,
  input: CatalogContextInput = {},
): CatalogContext {
  const rows = executor
    .select({
      key: skills.key,
      name: skills.name,
      category: skills.category,
    })
    .from(skills)
    .where(and(eq(skills.reviewStatus, 'approved'), isNull(skills.mergedIntoSkillId)))
    .orderBy(asc(skills.key))
    .all()
  const aliasRows = executor
    .select({ skillKey: skills.key, alias: skillAliases.alias })
    .from(skillAliases)
    .innerJoin(skills, eq(skillAliases.skillId, skills.id))
    .where(and(eq(skills.reviewStatus, 'approved'), isNull(skills.mergedIntoSkillId)))
    .orderBy(asc(skills.key), asc(skillAliases.normalizedAlias))
    .all()

  const aliasesBySkill = new Map<string, string[]>()
  for (const alias of aliasRows) {
    const list = aliasesBySkill.get(alias.skillKey) ?? []
    list.push(alias.alias)
    aliasesBySkill.set(alias.skillKey, list)
  }

  const catalog: CatalogContextEntry[] = rows.map((row) => ({
    key: row.key,
    name: row.name,
    category: row.category,
    aliases: aliasesBySkill.get(row.key) ?? [],
  }))

  const queryTerms = normalizedQueryTerms(input.terms)
  if (input.text?.trim()) for (const term of catalogTermsFromText(input.text)) queryTerms.add(term)
  const selected = catalog.filter((entry) => entryClaims(entry, queryTerms))
  const selectedKeys = new Set(selected.map((entry) => entry.key))
  const categories = new Set(
    selected.map((entry) => entry.category).filter((category): category is string => !!category),
  )

  let truncated = false
  let remaining = catalogContextCategoryCandidateLimit
  for (const entry of catalog) {
    if (selectedKeys.has(entry.key)) continue
    if (!entry.category || !categories.has(entry.category)) continue
    if (remaining === 0) {
      truncated = true
      break
    }
    selected.push(entry)
    selectedKeys.add(entry.key)
    remaining -= 1
  }

  const entries = selected.sort((left, right) => left.key.localeCompare(right.key))
  return {
    entries,
    fingerprint: canonicalHash({ schemaVersion: 1, entries }),
    truncated,
  }
}
