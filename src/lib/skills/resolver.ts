import type { SourceOccurrence } from '../career/json-schemas'
import type { CatalogContextEntry } from './catalog-context'
import { canonicalSkillKey, normalizeSkillAlias, splitCompositeSkillTerm } from './normalize'

/**
 * Deterministic, server-verified resolution of JD requirement terms against a
 * frozen catalog snapshot.
 *
 * The model may propose a catalog `key`, but a proposal is honoured only when
 * that exact key exists in the snapshot supplied for the run; anything else is
 * ignored and the raw term stays pending. Resolution never invents a catalog
 * record and never uses fuzzy matching: only an exact key / normalized display
 * name / curated alias claims a term.
 *
 * Resolution order:
 * 1. a broad concept documented in {@link broadSkillConcepts} stays pending;
 * 2. a model-proposed key present in the frozen snapshot resolves;
 * 3. an exact catalog key / normalized display name / curated alias resolves;
 * 4. a term claimed by more than one catalog entry stays pending;
 * 5. a conjunctive composite resolves to one mention per part only when every
 *    part resolves;
 * 6. anything else stays pending.
 *
 * The result set and its order never depend on the order of the terms in the
 * sentence: mentions are deduplicated by normalized term and sorted by it.
 */

export type RequirementTermInput = {
  term: string
  sourceText?: string | null
  confidence?: number | null
  /** Model-proposed catalog key from the frozen snapshot. */
  key?: string | null
}

export type ResolvedMention = {
  rawTerm: string
  normalizedTerm: string
  occurrences: SourceOccurrence[]
  state: 'mapped' | 'pending'
  skillKey?: string
}

/**
 * Curated broad concepts. They may remain requirements, but they must never
 * resolve to a specific technical skill: mapping one would claim a concrete
 * technology the posting never asked for. Extend deliberately, never by
 * guessing.
 */
const broadSkillConcepts: readonly string[] = [
  'api',
  'apis',
  'api integration',
  'api integrations',
  'frontend development',
  'backend development',
  'full stack development',
  'fullstack development',
  'web development',
  'software development',
].map(normalizeSkillAlias)

export type ResolveRequirementTermsInput = {
  terms: readonly RequirementTermInput[]
  catalog: readonly CatalogContextEntry[]
}

function claims(catalog: readonly CatalogContextEntry[]): Map<string, Set<string>> {
  const byTerm = new Map<string, Set<string>>()
  for (const entry of catalog) {
    const keys = new Set<string>([
      normalizeSkillAlias(entry.key),
      canonicalSkillKey(entry.name),
      normalizeSkillAlias(entry.name),
    ])
    for (const alias of entry.aliases) keys.add(normalizeSkillAlias(alias))
    for (const key of keys) {
      const owners = byTerm.get(key) ?? new Set<string>()
      owners.add(entry.key)
      byTerm.set(key, owners)
    }
  }
  return byTerm
}

/** Catalog key for a single term, or undefined when ambiguous/unresolvable. */
function resolveTerm(
  term: string,
  ownersByTerm: ReadonlyMap<string, Set<string>>,
  catalogKeys: ReadonlySet<string>,
  proposedKey: string | null,
): string | undefined {
  const normalized = normalizeSkillAlias(term)
  if (normalized === '' || broadSkillConcepts.includes(normalized)) return undefined
  if (proposedKey) {
    const key = normalizeSkillAlias(proposedKey)
    if (catalogKeys.has(key)) return key
  }
  const owners = ownersByTerm.get(normalized) ?? ownersByTerm.get(canonicalSkillKey(term))
  if (owners?.size === 1) return [...owners][0]
  return undefined
}

function occurrenceFor(term: RequirementTermInput): SourceOccurrence {
  return {
    source: 'job-analysis',
    provenance: 'job-parser',
    context: term.sourceText ?? null,
    confidence: term.confidence ?? null,
  }
}

function mentionsForTerm(
  term: RequirementTermInput,
  ownersByTerm: ReadonlyMap<string, Set<string>>,
  catalogKeys: ReadonlySet<string>,
): ResolvedMention[] {
  const rawTerm = term.term.trim()
  if (rawTerm === '') return []
  const occurrence = occurrenceFor(term)
  const proposedKey = term.key?.trim() ? term.key.trim() : null
  const direct = resolveTerm(rawTerm, ownersByTerm, catalogKeys, proposedKey)
  const finalize = (mentionRawTerm: string, skillKey: string | undefined): ResolvedMention => ({
    rawTerm: mentionRawTerm,
    normalizedTerm: normalizeSkillAlias(mentionRawTerm),
    occurrences: [occurrence],
    ...(skillKey ? { state: 'mapped' as const, skillKey } : { state: 'pending' as const }),
  })
  if (direct) return [finalize(rawTerm, direct)]

  const parts = splitCompositeSkillTerm(rawTerm)
  if (parts.length > 1) {
    const resolvedParts = parts.map((part) => ({
      part,
      skillKey: resolveTerm(part, ownersByTerm, catalogKeys, null),
    }))
    return resolvedParts.map((part) => finalize(part.part, part.skillKey))
  }
  return [finalize(rawTerm, undefined)]
}

/**
 * Resolves every supplied term, keeping one mention per normalized term and
 * merging repeated occurrences of the same term. The result order is
 * deterministic and independent of the input sentence order.
 */
export function resolveRequirementTerms(input: ResolveRequirementTermsInput): ResolvedMention[] {
  const ownersByTerm = claims(input.catalog)
  const catalogKeys = new Set(input.catalog.map((entry) => normalizeSkillAlias(entry.key)))
  const merged = new Map<string, ResolvedMention>()
  for (const term of input.terms) {
    for (const mention of mentionsForTerm(term, ownersByTerm, catalogKeys)) {
      const existing = merged.get(mention.normalizedTerm)
      if (!existing) {
        merged.set(mention.normalizedTerm, mention)
        continue
      }
      const occurrences = [...existing.occurrences]
      for (const occurrence of mention.occurrences) {
        const encoded = JSON.stringify(occurrence)
        if (!occurrences.some((candidate) => JSON.stringify(candidate) === encoded))
          occurrences.push(occurrence)
      }
      merged.set(mention.normalizedTerm, { ...existing, occurrences })
    }
  }
  return [...merged.values()].sort((left, right) =>
    left.normalizedTerm.localeCompare(right.normalizedTerm),
  )
}
