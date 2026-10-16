import type { GenerationRules } from '../career/json-schemas'

/**
 * Shared editorial budgets for LLM drafting and deterministic validation.
 * These limits target the current DOCX renderer while leaving the model room
 * to preserve the approved Base Resume's strongest structure and phrasing.
 *
 * The numbers below are the documented seed/default. A direction may store its
 * own bounded rules in `career_directions.rules_json`; `effectiveDocumentDraftPolicy`
 * overlays those over this default. Direction preferences only tune budgets —
 * factual constraints (metric provenance, excluded skills, section contract)
 * are always applied and can never be switched off by a preference.
 */
export type DocumentDraftPolicy = {
  resume: {
    maxWords: number
    maxBullets: number
    summaryMaxWords: number
    /** Optional per-section word budgets keyed by draft section id. */
    sectionWordBudgets: Record<string, number>
  }
  coverLetter: {
    maxWords: number
    minEvidenceParagraphs: number
    maxEvidenceParagraphs: number
  }
}

export const documentDraftPolicy: DocumentDraftPolicy = {
  resume: {
    maxWords: 750,
    maxBullets: 30,
    summaryMaxWords: 90,
    sectionWordBudgets: {},
  },
  coverLetter: {
    maxWords: 400,
    minEvidenceParagraphs: 2,
    maxEvidenceParagraphs: 3,
  },
}

/**
 * The effective policy for a direction: every stored rule overrides the seeded
 * default, and a direction without stored rules (legacy or import-only) uses
 * the default unchanged. Cover-letter budgets are not direction preferences.
 */
export function effectiveDocumentDraftPolicy(rules?: GenerationRules | null): DocumentDraftPolicy {
  if (!rules) return documentDraftPolicy
  return {
    resume: {
      maxWords: rules.maxWords ?? documentDraftPolicy.resume.maxWords,
      maxBullets: rules.maxBullets ?? documentDraftPolicy.resume.maxBullets,
      summaryMaxWords:
        rules.summaryMaxWords ??
        rules.sectionWordBudgets?.summary ??
        documentDraftPolicy.resume.summaryMaxWords,
      sectionWordBudgets: rules.sectionWordBudgets ?? {},
    },
    coverLetter: documentDraftPolicy.coverLetter,
  }
}
