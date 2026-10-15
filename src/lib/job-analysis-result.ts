import {
  type JobAnalysis,
  jobAnalysisSchema,
  legacyJobAnalysisSchema,
} from '../ai/schemas/job-analysis'

/**
 * Parses a stored `result_json` value back into a validated structured Job
 * Analysis. Returns null for missing or malformed JSON so legacy/null-schema
 * runs stay readable without crashing downstream projections.
 *
 * A run stored under the v4 contract (per-requirement `skillReferences`) is
 * still readable: its raw labels become the requirement's raw terms, so the
 * historical result keeps its original wording and is never re-resolved as if
 * the model had produced the current contract.
 */
export function parseJobAnalysisResult(resultJson: string | null): JobAnalysis | null {
  if (!resultJson) return null
  try {
    const value: unknown = JSON.parse(resultJson)
    const current = jobAnalysisSchema.safeParse(value)
    if (current.success) return current.data
    const legacy = legacyJobAnalysisSchema.safeParse(value)
    return legacy.success ? legacyToCurrentAnalysis(legacy.data) : null
  } catch {
    return null
  }
}

/** Projects the stored v4 requirement references onto the current term shape. */
function legacyToCurrentAnalysis(
  analysis: ReturnType<typeof legacyJobAnalysisSchema.parse>,
): JobAnalysis {
  return {
    ...analysis,
    requirements: analysis.requirements.map((requirement) => ({
      type: requirement.type,
      importance: requirement.importance,
      basis: requirement.basis,
      statement: requirement.statement,
      sourceText: requirement.sourceText,
      inferenceRationale: requirement.inferenceRationale,
      terms: requirement.skillReferences.map((reference) => ({
        term: reference.rawLabel,
        sourceText: null,
        confidence: reference.confidence,
        key: null,
      })),
    })),
  }
}
