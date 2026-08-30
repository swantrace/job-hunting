import { type JobAnalysis, jobAnalysisSchema } from '../ai/schemas/job-analysis'

/**
 * Parses a stored `result_json` value back into a validated structured Job
 * Analysis. Returns null for missing or malformed JSON so legacy/null-schema
 * runs stay readable without crashing downstream projections.
 */
export function parseJobAnalysisResult(resultJson: string | null): JobAnalysis | null {
  if (!resultJson) return null
  try {
    const parsed = jobAnalysisSchema.safeParse(JSON.parse(resultJson))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
