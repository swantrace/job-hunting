import { jobParserPromptVersion, jobParserSystemPrompt } from '../ai/prompts/job-parser'
import { jobParserResponseSchema, type ParsedJob, parsedJobSchema } from '../ai/schemas/job-parser'

export { type ParsedJob, parsedJobSchema }
export type ParsedJobResult = ParsedJob & {
  parserModel: string
  parserPromptVersion: string
}

export class OpenAIRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export async function parseJobDescription(
  env: Record<string, string | undefined>,
  description: string,
): Promise<ParsedJobResult> {
  const apiKey = env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured')
  const model = env.OPENAI_MODEL_JOB_PARSER ?? env.OPENAI_MODEL_DEFAULT ?? 'gpt-5-mini'
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      model,
      input: [
        {
          role: 'system',
          content: `${jobParserSystemPrompt}\nPrompt version: ${jobParserPromptVersion}`,
        },
        { role: 'user', content: description },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'job_posting',
          strict: true,
          schema: jobParserResponseSchema,
        },
      },
    }),
  })
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
  const parsed = parsedJobSchema.parse(JSON.parse(output))
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
    skills: cleanList(parsed.skills),
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
  }
}
