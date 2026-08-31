import type { MiddlewareHandler } from 'hono'
import { basicAuth } from 'hono/basic-auth'

export type AuthenticationEnvironment = {
  APP_AUTH_REQUIRED?: string
  APP_AUTH_USERNAME?: string
  APP_AUTH_PASSWORD?: string
}

function enabled(value: string | undefined) {
  return value?.trim().toLowerCase() === 'true'
}

/**
 * Single-user authentication for the private tracker. A deployment that opts
 * into required auth fails closed when either credential is absent. Local
 * development remains open unless credentials or APP_AUTH_REQUIRED are set.
 */
export function createAuthenticationMiddleware(
  environment: AuthenticationEnvironment = process.env as AuthenticationEnvironment,
): MiddlewareHandler {
  return async (c, next) => {
    const username = environment.APP_AUTH_USERNAME?.trim()
    const password = environment.APP_AUTH_PASSWORD
    if (!username || !password) {
      if (enabled(environment.APP_AUTH_REQUIRED))
        return c.text('Authentication is required but is not configured.', 503)
      return next()
    }
    return basicAuth({ username, password, realm: 'Job Tracker' })(c, next)
  }
}
