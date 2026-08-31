import { describe, expect, test } from 'bun:test'
import { Hono, type MiddlewareHandler } from 'hono'
import { csrf } from 'hono/csrf'
import { secureHeaders } from 'hono/secure-headers'
import { createAuthenticationMiddleware } from '../src/lib/auth'

function basic(username: string, password: string) {
  return `Basic ${btoa(`${username}:${password}`)}`
}

function app(environment: Parameters<typeof createAuthenticationMiddleware>[0]) {
  const application = new Hono()
  const noStore: MiddlewareHandler = async (c, next) => {
    await next()
    c.header('Cache-Control', 'no-store')
  }
  application.use(secureHeaders())
  application.use(noStore)
  application.use(createAuthenticationMiddleware(environment))
  application.use(csrf())
  application.get('/', (c) => c.text('private'))
  application.post('/mutation', (c) => c.text('changed'))
  return application
}

describe('single-user application authentication', () => {
  test('keeps local development open when auth is neither configured nor required', async () => {
    const response = await app({}).request('/')
    expect(response.status).toBe(200)
  })

  test('fails closed when a required deployment is missing credentials', async () => {
    const response = await app({ APP_AUTH_REQUIRED: 'true' }).request('/')
    expect(response.status).toBe(503)
    expect(await response.text()).toContain('not configured')
  })

  test('challenges missing credentials and accepts the configured user', async () => {
    const application = app({
      APP_AUTH_REQUIRED: 'true',
      APP_AUTH_USERNAME: 'fred',
      APP_AUTH_PASSWORD: 'long-random-password',
    })
    const denied = await application.request('/')
    expect(denied.status).toBe(401)
    expect(denied.headers.get('www-authenticate')).toContain('Basic')

    const allowed = await application.request('/', {
      headers: { Authorization: basic('fred', 'long-random-password') },
    })
    expect(allowed.status).toBe(200)
    expect(await allowed.text()).toBe('private')
  })

  test('rejects cross-site form mutations after authentication', async () => {
    const response = await app({
      APP_AUTH_REQUIRED: 'true',
      APP_AUTH_USERNAME: 'fred',
      APP_AUTH_PASSWORD: 'long-random-password',
    }).request('/mutation', {
      method: 'POST',
      headers: {
        Authorization: basic('fred', 'long-random-password'),
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: 'https://attacker.example',
        'Sec-Fetch-Site': 'cross-site',
      },
      body: 'value=forged',
    })
    expect(response.status).toBe(403)
  })

  test('adds anti-caching and security headers to protected responses', async () => {
    const response = await app({ APP_AUTH_REQUIRED: 'true' }).request('/')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('x-frame-options')).toBe('SAMEORIGIN')
  })
})
