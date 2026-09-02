import { jobAnalysisPromptVersion, jobAnalysisSystemPrompt } from '../ai/prompts/job-analysis'
import { jobParserPromptVersion, jobParserSystemPrompt } from '../ai/prompts/job-parser'
import type { JobAnalysis } from '../ai/schemas/job-analysis'
import {
  jobAnalysisCombinedResponseSchema,
  type ParsedJob,
  type ParsedJobWithAnalysis,
  parsedJobSchema,
  parsedJobWithAnalysisSchema,
} from '../ai/schemas/job-parser'
import { listDirections } from './directions'

export { type JobAnalysis, type ParsedJob, type ParsedJobWithAnalysis, parsedJobSchema }
export type ParsedJobResult = ParsedJobWithAnalysis & {
  parserModel: string
  parserPromptVersion: string
  analysisPromptVersion: string
}

export class OpenAIRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export class OpenAIRequestTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`OpenAI request timed out after ${timeoutMs}ms`)
  }
}

const analysisArrayLimits = {
  requirements: 40,
  interviewQuestions: 20,
  painPoints: 20,
  culture: 20,
  redFlags: 20,
  successMetrics: 20,
  benefits: 20,
} as const

function limitAnalysisArrays(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const parsed = value as Record<string, unknown>
  return Object.fromEntries(
    Object.entries(parsed).map(([key, field]) => {
      const limit = analysisArrayLimits[key as keyof typeof analysisArrayLimits]
      return [key, limit && Array.isArray(field) ? field.slice(0, limit) : field]
    }),
  )
}

function limitParserArrays(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const parsed = value as Record<string, unknown>
  return Object.fromEntries(
    Object.entries(parsed).map(([key, field]) => {
      if (key === 'analysis') return [key, limitAnalysisArrays(field)]
      return [key, field]
    }),
  )
}

function parserTimeoutMs(env: Record<string, string | undefined>) {
  const configured = Number(env.OPENAI_JOB_PARSER_TIMEOUT_MS)
  if (!Number.isFinite(configured)) return 90_000
  return Math.min(Math.max(configured, 10_000), 300_000)
}

export async function parseJobDescription(
  env: Record<string, string | undefined>,
  description: string,
): Promise<ParsedJobResult> {
  const apiKey = env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured')
  const model = env.OPENAI_MODEL_JOB_PARSER ?? env.OPENAI_MODEL_DEFAULT ?? 'gpt-5.6-terra'
  const timeoutMs = parserTimeoutMs(env)
  const directions = listDirections()
  const directionIds = directions.map((direction) => direction.id)
  const directionsHint = directions
    .map((direction) => `${direction.id} (${direction.label})`)
    .join(', ')
  let response: Response
  try {
    response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Client-Request-Id': crypto.randomUUID(),
      },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        model,
        input: [
          {
            role: 'system',
            content: `${jobParserSystemPrompt}\n\n${jobAnalysisSystemPrompt}\nPrompt version: ${jobAnalysisPromptVersion}\n\nAvailable directions: ${directionsHint}`,
          },
          { role: 'user', content: description },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'job_posting',
            strict: true,
            schema: jobAnalysisCombinedResponseSchema(directionIds),
          },
        },
      }),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError')
      throw new OpenAIRequestTimeoutError(timeoutMs)
    throw error
  }
  if (!response.ok) {
    const errorBody = await response.text()
    let detail = ''
    try {
      const parsed = JSON.parse(errorBody) as { error?: { message?: string } }
      detail = parsed.error?.message ?? ''
    } catch {
      detail = ''
    }
    throw new OpenAIRequestError(
      `OpenAI request failed (${response.status})${detail ? `: ${detail}` : ''}`,
      response.status,
    )
  }
  const body = (await response.json()) as {
    output_text?: string
    output?: { content?: { text?: string }[] }[]
  }
  const output =
    body.output_text ??
    body.output?.flatMap((item) => item.content ?? []).find((part) => part.text)?.text
  if (!output) throw new Error('OpenAI returned no structured result')
  const parsed = parsedJobWithAnalysisSchema.parse(limitParserArrays(JSON.parse(output)))
  if (!directionIds.includes(parsed.direction))
    throw new Error(`The model returned an unknown direction "${parsed.direction}".`)
  const nullString = (value: string | null) =>
    value?.trim().toLocaleLowerCase() === 'null' ? null : value
  const cleanList = (values: string[]) => [
    ...new Set(values.map((value) => value.trim()).filter((value) => value && value !== 'null')),
  ]
  return {
    ...parsed,
    jobTitle: parsed.jobTitle.toLocaleLowerCase() === 'null' ? '' : parsed.jobTitle,
    location: nullString(parsed.location),
    postedDate: nullString(parsed.postedDate),
    salary: nullString(parsed.salary),
    analysis: {
      ...parsed.analysis,
      painPoints: cleanList(parsed.analysis.painPoints),
      culture: cleanList(parsed.analysis.culture),
      redFlags: cleanList(parsed.analysis.redFlags),
      successMetrics: cleanList(parsed.analysis.successMetrics),
      benefits: cleanList(parsed.analysis.benefits),
      notes: nullString(parsed.analysis.notes),
    },
    parserModel: model,
    parserPromptVersion: jobParserPromptVersion,
    analysisPromptVersion: jobAnalysisPromptVersion,
  }
}
