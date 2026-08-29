export type AtsImportance = 'required' | 'preferred' | 'mentioned'

export type AtsTerm = {
  canonical: string
  aliases: string[]
  evidenceEligible: boolean
  importance?: AtsImportance
}

export type AtsMatch = {
  canonical: string
  matched: string
}

export type AtsAuditResult = {
  exactMatches: AtsMatch[]
  aliasMatches: Array<AtsMatch & { alias: string }>
  missingButSupported: AtsMatch[]
  unsupportedTerms: AtsMatch[]
  safeAdditions: AtsMatch[]
  repetitionWarnings: string[]
  coverage: {
    matchedWeight: number
    totalWeight: number
    percentage: number | null
  }
}

const importanceWeight: Record<AtsImportance, number> = {
  required: 3,
  preferred: 1,
  mentioned: 0,
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Case-insensitive, punctuation-aware token match. The boundary after the term
 * excludes `+` and `#` so `C` never matches inside `C++` or `C#`, while
 * punctuation-prefixed terms such as `.NET` and `Node.js` still match.
 */
function containsToken(text: string, term: string) {
  const regex = new RegExp(`(^|[^a-z0-9])${escapeRegExp(term)}(?![a-z0-9+#])($|[^a-z0-9])`, 'i')
  return regex.test(text)
}

function countOccurrences(text: string, term: string) {
  const regex = new RegExp(`(^|[^a-z0-9])${escapeRegExp(term)}(?![a-z0-9+#])($|[^a-z0-9])`, 'gi')
  return (text.match(regex) ?? []).length
}

export function auditResumeKeywords(input: {
  requiredTerms: AtsTerm[]
  resumeText: string
}): AtsAuditResult {
  const resumeText = input.resumeText.trim()
  const exactMatches: AtsMatch[] = []
  const aliasMatches: Array<AtsMatch & { alias: string }> = []
  const missingButSupported: AtsMatch[] = []
  const unsupportedTerms: AtsMatch[] = []
  const safeAdditions: AtsMatch[] = []
  const repetitionWarnings: string[] = []

  let matchedWeight = 0
  let totalWeight = 0

  for (const term of input.requiredTerms) {
    const weight = importanceWeight[term.importance ?? 'required']
    totalWeight += weight

    const canonicalHit = containsToken(resumeText, term.canonical)
    const aliasHit = term.aliases.find((alias) => containsToken(resumeText, alias))

    if (canonicalHit) {
      exactMatches.push({ canonical: term.canonical, matched: term.canonical })
      matchedWeight += weight
      const occurrences = countOccurrences(resumeText, term.canonical)
      if (occurrences > 3)
        repetitionWarnings.push(`"${term.canonical}" appears ${occurrences} times.`)
    } else if (aliasHit) {
      aliasMatches.push({ canonical: term.canonical, matched: aliasHit, alias: aliasHit })
      matchedWeight += weight
    } else if (term.evidenceEligible) {
      missingButSupported.push({ canonical: term.canonical, matched: term.canonical })
      safeAdditions.push({ canonical: term.canonical, matched: term.canonical })
    } else {
      unsupportedTerms.push({ canonical: term.canonical, matched: term.canonical })
    }
  }

  const percentage = totalWeight === 0 ? null : (matchedWeight / totalWeight) * 100

  return {
    exactMatches,
    aliasMatches,
    missingButSupported,
    unsupportedTerms,
    safeAdditions,
    repetitionWarnings,
    coverage: { matchedWeight, totalWeight, percentage },
  }
}
