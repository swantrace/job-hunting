import { setCookie } from 'hono/cookie'
import { createRoute } from 'honox/factory'
import { googleAuthorizationUrl } from '../../../../src/lib/google-drive'

export default createRoute((c) => {
  try {
    const state = crypto.randomUUID()
    setCookie(c, 'google_oauth_state', state, {
      httpOnly: true,
      secure: new URL(c.req.url).protocol === 'https:',
      sameSite: 'Lax',
      path: '/auth/google',
      maxAge: 600,
    })
    return c.redirect(googleAuthorizationUrl(state))
  } catch (error) {
    return c.html(
      <div class="alert alert-error">
        {error instanceof Error ? error.message : 'Unable to start Google Drive connection.'}
      </div>,
      500,
    )
  }
})
