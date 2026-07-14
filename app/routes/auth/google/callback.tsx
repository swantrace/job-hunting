import { deleteCookie, getCookie } from 'hono/cookie'
import { createRoute } from 'honox/factory'
import { connectGoogleDrive } from '../../../../src/lib/google-drive'

export default createRoute(async (c) => {
  const state = c.req.query('state')
  const code = c.req.query('code')
  const expectedState = getCookie(c, 'google_oauth_state')
  deleteCookie(c, 'google_oauth_state', { path: '/auth/google' })
  if (!code || !state || !expectedState || state !== expectedState)
    return c.html(
      <div class="alert alert-error">
        Google Drive authorization could not be verified. Please try again.
      </div>,
      400,
    )
  try {
    await connectGoogleDrive(code)
    return c.redirect('/')
  } catch (error) {
    console.error('Google Drive connection failed', error)
    return c.html(
      <div class="alert alert-error">
        {error instanceof Error ? error.message : 'Google Drive connection failed.'}
      </div>,
      502,
    )
  }
})
