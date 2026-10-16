/**
 * Model selection, per stage. Every AI stage reads its own environment variable
 * and falls back to `OPENAI_MODEL_DEFAULT`, so switching models is a
 * configuration change rather than a code change. The fallbacks live here and
 * nowhere else.
 *
 * GPT-6 family: `gpt-6-astra` (highest intelligence), `gpt-6.1-sol` (balanced:
 * near-Astra performance at lower cost), `gpt-6-luna` (fastest and cheapest).
 * Neither `gpt-6-astra` nor `gpt-6.1-sol` supports the `none` or `minimal`
 * reasoning effort; this application does not set `reasoning.effort` at all.
 */
export const defaultModelId = 'gpt-6.1-sol'

export type ModelEnv = Record<string, string | undefined>

function stageModel(env: ModelEnv, variable: string): string {
  return env[variable]?.trim() || env.OPENAI_MODEL_DEFAULT?.trim() || defaultModelId
}

/** Job Description parsing and structured requirement extraction. */
export function jobParserModelId(env: ModelEnv = process.env): string {
  return stageModel(env, 'OPENAI_MODEL_JOB_PARSER')
}

/** Candidate-fit assessment: the evidence status every later decision rests on. */
export function candidateFitModelId(env: ModelEnv = process.env): string {
  return stageModel(env, 'OPENAI_MODEL_CANDIDATE_FIT')
}

/** Advisory review of a generated document. */
export function documentReviewModelId(env: ModelEnv = process.env): string {
  return stageModel(env, 'OPENAI_MODEL_DOCUMENT_REVIEW')
}

/** Resume drafting. */
export function resumeModelId(env: ModelEnv = process.env): string {
  return stageModel(env, 'OPENAI_MODEL_RESUME')
}

/** Cover letter drafting. */
export function coverLetterModelId(env: ModelEnv = process.env): string {
  return stageModel(env, 'OPENAI_MODEL_COVER_LETTER')
}
