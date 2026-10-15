import { createRoute } from 'honox/factory'
import { db } from '../../../../../src/db/client'
import {
  buildChatGptContextJson,
  ChatGptContextError,
  serializeChatGptContext,
} from '../../../../../src/lib/career/chatgpt-context'
import { queryFlag } from '../../../../../src/lib/request'

/**
 * One ChatGPT JSON context, full or direction-scoped. The response is a file
 * download; no model or network call is made. Contact details and private URLs
 * are excluded unless the operator explicitly opts in.
 */
export const GET = createRoute((c) => {
  const direction = (c.req.query('direction') ?? '').trim()
  try {
    const context = buildChatGptContextJson(db, {
      directionKey: direction === '' ? null : direction,
      includeSourceUrls: queryFlag(c.req.query('includeSourceUrls')),
      includeContactDetails: queryFlag(c.req.query('includeContactDetails')),
    })
    const suffix = direction === '' ? 'full' : direction
    const filename = `chatgpt-career-context-${suffix}-${new Date().toISOString().slice(0, 10)}.json`
    return new Response(serializeChatGptContext(context), {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
    })
  } catch (error) {
    const message =
      error instanceof ChatGptContextError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'The context could not be built.'
    return c.html(
      <div class="alert alert-warning" role="alert">
        {message} Approve a Base Resume for the direction on the Base resumes tab first.
      </div>,
      422,
    )
  }
})
