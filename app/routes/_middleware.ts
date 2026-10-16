import type { MiddlewareHandler } from 'hono'
import { csrf } from 'hono/csrf'
import { secureHeaders } from 'hono/secure-headers'
import { createAuthenticationMiddleware } from '../../src/lib/auth'
import { intakeApiAuth, isIntakeApiPath } from '../../src/lib/job-intake/api-auth'

const noStore: MiddlewareHandler = async (c, next) => {
  await next()
  c.header('Cache-Control', 'no-store')
  c.header('Pragma', 'no-cache')
}

const websiteAuth = createAuthenticationMiddleware()
const websiteCsrf = csrf()
const apiAuth = intakeApiAuth()
const authentication: MiddlewareHandler = (c, next) =>
  isIntakeApiPath(c.req.path) ? apiAuth(c, next) : websiteAuth(c, next)
const requestForgery: MiddlewareHandler = (c, next) =>
  isIntakeApiPath(c.req.path) ? next() : websiteCsrf(c, next)
export default [secureHeaders(), noStore, authentication, requestForgery]
