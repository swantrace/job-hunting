import { jobParserPromptVersion, jobParserSystemPrompt } from '../ai/prompts/job-parser'
import { jobParserResponseSchema, type ParsedJob, parsedJobSchema } from '../ai/schemas/job-parser'

export { type ParsedJob, parsedJobSchema }

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
) {
  const apiKey = env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured')
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      model: env.OPENAI_MODEL_JOB_PARSER ?? env.OPENAI_MODEL_DEFAULT ?? 'gpt-5-mini',
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
  return {
    ...parsed,
    jobTitle: parsed.jobTitle.toLocaleLowerCase() === 'null' ? '' : parsed.jobTitle,
    companyName: parsed.companyName.toLocaleLowerCase() === 'null' ? '' : parsed.companyName,
    location: nullString(parsed.location),
    url: nullString(parsed.url),
    postedDate: nullString(parsed.postedDate),
    applicationSource: nullString(parsed.applicationSource),
    salary: nullString(parsed.salary),
    notes: nullString(parsed.notes),
  }
}
