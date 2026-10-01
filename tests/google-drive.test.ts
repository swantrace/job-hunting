import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test'

const originalEnvironment = {
  clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
  clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI,
  stateSecret: process.env.GOOGLE_OAUTH_STATE_SECRET,
}

beforeAll(() => {
  process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client'
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-secret'
  process.env.GOOGLE_OAUTH_REDIRECT_URI = 'http://localhost/auth/google/callback'
  process.env.GOOGLE_OAUTH_STATE_SECRET = 'test-state-secret'
})

afterAll(() => {
  for (const [name, value] of Object.entries({
    GOOGLE_OAUTH_CLIENT_ID: originalEnvironment.clientId,
    GOOGLE_OAUTH_CLIENT_SECRET: originalEnvironment.clientSecret,
    GOOGLE_OAUTH_REDIRECT_URI: originalEnvironment.redirectUri,
    GOOGLE_OAUTH_STATE_SECRET: originalEnvironment.stateSecret,
  })) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

async function connectedFixture() {
  const { encryptGoogleRefreshToken } = await import('../src/lib/google-drive')
  return {
    id: 1,
    refreshTokenEncrypted: encryptGoogleRefreshToken('refresh-token'),
    folderId: 'folder-id',
    createdAt: '2026-09-30',
    updatedAt: '2026-09-30',
  }
}

describe('Google Drive connection verification', () => {
  test('reports a verified connection after Google refreshes the token', async () => {
    const fetcher = mock(async () =>
      Response.json({ access_token: 'access-token', expires_in: 3600 }),
    )
    const { verifyGoogleDriveConnection } = await import('../src/lib/google-drive')

    expect(await verifyGoogleDriveConnection(await connectedFixture(), fetcher)).toEqual({
      state: 'connected',
    })
  })

  test('requires reconnection when Google rejects a revoked token', async () => {
    const fetcher = mock(async () =>
      Response.json(
        { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' },
        { status: 400 },
      ),
    )
    const { verifyGoogleDriveConnection } = await import('../src/lib/google-drive')

    expect(await verifyGoogleDriveConnection(await connectedFixture(), fetcher)).toEqual({
      state: 'reconnect-required',
      message: 'Google Drive authorization expired or was revoked.',
    })
  })

  test('does not request reconnection for a temporary verification failure', async () => {
    const fetcher = mock(async () => {
      throw new Error('network unavailable')
    })
    const { verifyGoogleDriveConnection } = await import('../src/lib/google-drive')

    expect(await verifyGoogleDriveConnection(await connectedFixture(), fetcher)).toEqual({
      state: 'unavailable',
      message: 'network unavailable',
    })
  })
})
