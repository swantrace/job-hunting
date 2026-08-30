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

const parserArrayLimits = {
  skills: 30,
  requirements: 30,
  responsibilities: 30,
  painPoints: 20,
  culture: 20,
  redFlags: 20,
  successMetrics: 20,
  benefits: 20,
} as const

const analysisArrayLimits = {
  requirements: 40,
  interviewQuestions: 20,
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
      const limit = parserArrayLimits[key as keyof typeof parserArrayLimits]
      return [key, limit && Array.isArray(field) ? field.slice(0, limit) : field]
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
            content: `${jobParserSystemPrompt}\n\n${jobAnalysisSystemPrompt}\nPrompt version: ${jobAnalysisPromptVersion}`,
          },
          { role: 'user', content: description },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'job_posting',
            strict: true,
            schema: jobAnalysisCombinedResponseSchema,
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
  const nullString = (value: string | null) =>
    value?.trim().toLocaleLowerCase() === 'null' ? null : value
  const cleanList = (values: string[]) => [
    ...new Set(values.map((value) => value.trim()).filter((value) => value && value !== 'null')),
  ]
  const cleanSkills = (skills: typeof parsed.skills) => {
    const seen = new Set<string>()
    const result: typeof parsed.skills = []
    for (const skill of skills) {
      const rawLabel = skill.rawLabel.trim()
      const canonicalLabel = skill.canonicalLabel.trim()
      if (!rawLabel && !canonicalLabel) continue
      const dedupeKey = (canonicalLabel || rawLabel).toLocaleLowerCase()
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)
      result.push({
        ...skill,
        rawLabel: rawLabel || canonicalLabel,
        canonicalLabel: canonicalLabel || rawLabel,
        sourceText: skill.sourceText.trim(),
      })
    }
    return result
  }
  return {
    ...parsed,
    jobTitle: parsed.jobTitle.toLocaleLowerCase() === 'null' ? '' : parsed.jobTitle,
    location: nullString(parsed.location),
    postedDate: nullString(parsed.postedDate),
    salary: nullString(parsed.salary),
    skills: cleanSkills(parsed.skills),
    requirements: cleanList(parsed.requirements),
    responsibilities: cleanList(parsed.responsibilities),
    painPoints: cleanList(parsed.painPoints),
    culture: cleanList(parsed.culture),
    redFlags: cleanList(parsed.redFlags),
    successMetrics: cleanList(parsed.successMetrics),
    benefits: cleanList(parsed.benefits),
    notes: nullString(parsed.notes),
    parserModel: model,
    parserPromptVersion: jobParserPromptVersion,
    analysisPromptVersion: jobAnalysisPromptVersion,
  }
}
