import { createHash, timingSafeEqual } from 'node:crypto'
import type { MiddlewareHandler } from 'hono'

export function isIntakeApiPath(path: string) {
  return /^\/api\/v1\/job-intake\/(?:capabilities|batches(?:\/\d+)?)$/.test(path)
}
export function intakeApiAuth(
  env: Record<string, string | undefined> = process.env,
): MiddlewareHandler {
  let windowStart = Date.now()
  let submissions = 0
  return async (c, next) => {
    const requestId = crypto.randomUUID()
    const fail = (code: string, message: string, status: 401 | 429 | 503) =>
      c.json({ error: { code, message }, requestId }, status)
    const token = env.JOB_INTAKE_API_TOKEN?.trim()
    if (!token) return fail('api-not-configured', 'The intake API is not configured.', 503)
    const received = c.req.header('Authorization')?.match(/^Bearer (\S+)$/)?.[1] ?? ''
    const digest = (s: string) => createHash('sha256').update(s).digest()
    if (!timingSafeEqual(digest(token), digest(received)))
      return fail('unauthorized', 'A valid intake API token is required.', 401)
    if (c.req.method === 'POST') {
      if (Date.now() - windowStart >= 60_000) {
        windowStart = Date.now()
        submissions = 0
      }
      if (++submissions > 60) {
        c.header(
          'Retry-After',
          String(Math.max(1, Math.ceil((windowStart + 60_000 - Date.now()) / 1000))),
        )
        return fail(
          'intake-rate-limit',
          'Too many submissions. Retry with the same key after the indicated delay.',
          429,
        )
      }
    }
    return next()
  }
}
