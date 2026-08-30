import { createCipheriv, createDecipheriv, createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  getGoogleDriveConnection,
  markArtifactUploaded,
  saveGoogleDriveConnection,
} from '../db/generation'
import { getArtifactsRoot } from './artifact-storage'

const scope = 'https://www.googleapis.com/auth/drive.file'
const tokenUrl = 'https://oauth2.googleapis.com/token'

function config() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI
  const stateSecret = process.env.GOOGLE_OAUTH_STATE_SECRET
  if (!clientId || !clientSecret || !redirectUri || !stateSecret)
    throw new Error('Google Drive OAuth is not configured.')
  return { clientId, clientSecret, redirectUri, stateSecret }
}

function key() {
  return createHash('sha256').update(config().stateSecret).digest()
}

export function encryptGoogleRefreshToken(token: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const data = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  return `${Buffer.from(iv).toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${data.toString('base64url')}`
}

function decryptGoogleRefreshToken(value: string) {
  const [iv, tag, data] = value.split('.')
  if (!iv || !tag || !data) throw new Error('Stored Google Drive credentials are invalid.')
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(data, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

export function googleAuthorizationUrl(state: string) {
  const { clientId, redirectUri } = config()
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope,
    access_type: 'offline',
    prompt: 'consent',
    state,
  }).toString()
  return url.toString()
}

export async function exchangeGoogleCode(code: string) {
  const { clientId, clientSecret, redirectUri } = config()
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const payload = (await response.json()) as { refresh_token?: string; error_description?: string }
  if (!response.ok || !payload.refresh_token)
    throw new Error(payload.error_description ?? 'Google did not return a refresh token.')
  return payload.refresh_token
}

async function accessToken() {
  const connection = getGoogleDriveConnection()
  if (!connection) throw new Error('Google Drive is not connected.')
  const { clientId, clientSecret } = config()
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: decryptGoogleRefreshToken(connection.refreshTokenEncrypted),
    grant_type: 'refresh_token',
  })
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const payload = (await response.json()) as {
    access_token?: string
    error?: string
    error_description?: string
  }
  if (!response.ok || !payload.access_token)
    throw new Error(
      payload.error_description === 'Token has been expired or revoked.' ||
        payload.error === 'invalid_grant'
        ? 'Google Drive authorization expired or was revoked. Connect Google Drive again.'
        : (payload.error_description ?? 'Unable to refresh Google Drive access.'),
    )
  return { token: payload.access_token, folderId: connection.folderId }
}

async function createFolder(token: string) {
  const response = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Job Application Tracker',
      mimeType: 'application/vnd.google-apps.folder',
    }),
  })
  const payload = (await response.json()) as { id?: string; error?: { message?: string } }
  if (!response.ok || !payload.id)
    throw new Error(payload.error?.message ?? 'Unable to create Google Drive folder.')
  return payload.id
}

async function folderIsAvailable(token: string, folderId: string) {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=id,mimeType,trashed`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!response.ok) return false
  const payload = (await response.json()) as { id?: string; mimeType?: string; trashed?: boolean }
  return (
    payload.id === folderId &&
    payload.mimeType === 'application/vnd.google-apps.folder' &&
    !payload.trashed
  )
}

export async function connectGoogleDrive(code: string) {
  const refreshToken = await exchangeGoogleCode(code)
  const existingConnection = getGoogleDriveConnection()
  const { clientId, clientSecret } = config()
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const token = ((await response.json()) as { access_token?: string }).access_token
  if (!response.ok || !token) throw new Error('Unable to verify Google Drive access.')
  const folderId = existingConnection?.folderId ?? (await createFolder(token))
  saveGoogleDriveConnection(encryptGoogleRefreshToken(refreshToken), folderId)
}

export async function uploadArtifactToGoogleDrive(artifact: {
  id: number
  fileName: string
  filePath: string
  mimeType: string
}) {
  const { token, folderId: configuredFolderId } = await accessToken()
  // A stored folder can become inaccessible when a local database is moved to
  // another Google account/project. Recreate the app folder instead of making
  // every upload fail with Drive's opaque "File not found" response.
  const folderId = (await folderIsAvailable(token, configuredFolderId))
    ? configuredFolderId
    : await createFolder(token)
  if (folderId !== configuredFolderId) {
    const connection = getGoogleDriveConnection()
    if (connection) saveGoogleDriveConnection(connection.refreshTokenEncrypted, folderId)
  }
  const bytes = await readFile(resolve(getArtifactsRoot(), artifact.filePath))
  const form = new FormData()
  form.set(
    'metadata',
    new Blob([JSON.stringify({ name: artifact.fileName, parents: [folderId] })], {
      type: 'application/json',
    }),
  )
  form.set('file', new Blob([bytes], { type: artifact.mimeType }), artifact.fileName)
  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form },
  )
  const payload = (await response.json()) as {
    id?: string
    webViewLink?: string
    error?: { message?: string }
  }
  if (!response.ok || !payload.id)
    throw new Error(payload.error?.message ?? 'Google Drive upload failed.')
  markArtifactUploaded(artifact.id, payload.id, payload.webViewLink ?? null)
}
