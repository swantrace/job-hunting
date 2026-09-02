/**
 * Shared editorial budgets for LLM drafting and deterministic validation.
 * These limits target the current DOCX renderer while leaving the model room
 * to preserve the approved Base Resume's strongest structure and phrasing.
 */
export const documentDraftPolicy = {
  resume: {
    maxWords: 750,
    maxBullets: 30,
    summaryMaxWords: 90,
  },
  coverLetter: {
    maxWords: 400,
    minEvidenceParagraphs: 2,
    maxEvidenceParagraphs: 3,
  },
} as const
