import { createRoute } from 'honox/factory'
import { OpenAIRequestError, parseJobDescription } from '../../../src/lib/ai'
import { parseFilters } from '../../../src/lib/request'
import { AiParser, ParsedJobDraft } from '../../components/AiParser'

export const POST = createRoute(async (c) => {
  const form = await c.req.formData()
  const description = form.get('description')
  const filters = parseFilters(c)
  if (typeof description !== 'string' || description.trim().length < 20)
    return c.html(
      <div class="alert alert-error">Paste at least 20 characters of a job description.</div>,
      422,
    )
  try {
    const runtimeEnv = {
      ...process.env,
      ...(c.env ?? {}),
    } as Record<string, string | undefined>
    const parsed = await parseJobDescription(runtimeEnv, description.trim())
    return c.html(
      <ParsedJobDraft parsed={parsed} filters={filters} jobPostText={description.trim()} />,
    )
  } catch (error) {
    console.error('AI job parsing failed', error)
    const message =
      error instanceof Error && error.message.includes('not configured')
        ? 'AI parsing is not configured on this server.'
        : error instanceof OpenAIRequestError && error.status === 401
          ? 'OpenAI rejected the API key. Check OPENAI_API_KEY.'
          : error instanceof OpenAIRequestError && error.status === 404
            ? 'The configured OpenAI model was not found. Check OPENAI_MODEL_JOB_PARSER.'
            : error instanceof OpenAIRequestError && error.status === 429
              ? 'OpenAI rate limit or account quota reached. Try again later.'
              : 'AI parsing failed. Check the text and try again.'
    return c.html(<div class="alert alert-error">{message}</div>, 502)
  }
})
