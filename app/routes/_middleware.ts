import type { MiddlewareHandler } from 'hono'
import { csrf } from 'hono/csrf'
import { secureHeaders } from 'hono/secure-headers'
import { createAuthenticationMiddleware } from '../../src/lib/auth'

const noStore: MiddlewareHandler = async (c, next) => {
  await next()
  c.header('Cache-Control', 'no-store')
  c.header('Pragma', 'no-cache')
}

export default [secureHeaders(), noStore, createAuthenticationMiddleware(), csrf()]
