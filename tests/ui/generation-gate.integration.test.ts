import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import {
  mockEnqueueGeneration,
  mockGetApplicationReadiness,
  mockGetGenerationState,
  mockGetGoogleDriveConnectionStatus,
  mockListGenerationRuns,
  mockUploadArtifactToGoogleDrive,
} from './support/runtime-mocks'

const pendingArtifacts = [
  {
    id: 101,
    generationRunId: 10,
    type: 'resume',
    fileName: 'resume.docx',
    filePath: 'resume.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    googleDriveFileId: null,
    googleDriveUrl: null,
    googleDriveUploadedAt: null,
    googleDriveError: null,
    createdAt: '2026-09-30',
  },
  {
    id: 102,
    generationRunId: 10,
    type: 'cover_letter',
    fileName: 'cover-letter.docx',
    filePath: 'cover-letter.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    googleDriveFileId: null,
    googleDriveUrl: null,
    googleDriveUploadedAt: null,
    googleDriveError: null,
    createdAt: '2026-09-30',
  },
]

function runsWith(artifacts: typeof pendingArtifacts) {
  return [{ id: 10, status: 'Completed', attempts: 1, artifacts }]
}

async function applicationsHarness() {
  const { POST } = (await import('../../app/routes/applications/index')) as Record<string, unknown>
  const app = new Hono()
  app.post('/applications', POST as never)
  return app
}

async function generationRunsHarness() {
  const { POST } = (await import('../../app/routes/applications/[id]/generation-runs')) as Record<
    string,
    unknown
  >
  const app = new Hono()
  app.post('/applications/:id/generation-runs', POST as never)
  return app
}

describe('generation readiness gate', () => {
  test('does not enqueue document generation when an opportunity is saved', async () => {
    mockEnqueueGeneration.mockClear()
    const response = await (await applicationsHarness()).request('/applications', {
      method: 'POST',
      body: new URLSearchParams({
        jobTitle: 'Engineer',
        companyName: 'Acme',
        direction: 'fullstack',
        postedDate: '2026-08-28',
      }),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    })

    expect(response.status).toBe(200)
    expect(mockEnqueueGeneration).not.toHaveBeenCalled()
  })

  test('blocks explicit generation when the readiness service reports blockers', async () => {
    mockGetApplicationReadiness.mockReturnValue({
      ready: false,
      reasons: ['Resolve every missing-skill decision before generating documents.'],
    })
    const response = await (await generationRunsHarness()).request(
      '/applications/7/generation-runs',
      { method: 'POST' },
    )

    expect(response.status).toBe(422)
    expect(mockEnqueueGeneration).not.toHaveBeenCalled()
    mockGetApplicationReadiness.mockReturnValue({ ready: true, reasons: [] })
  })

  test('shows state-specific regeneration copy and reasons for stale generations', async () => {
    mockGetGenerationState.mockReturnValue({
      state: 'stale',
      latest: null,
      latestCompleted: { id: 1, status: 'Completed' },
      currentCompleted: null,
      staleCompleted: { id: 1, status: 'Completed' },
      reasons: ['candidate-analysis-changed'],
    })
    mockGetApplicationReadiness.mockReturnValue({ ready: true, reasons: [] })
    const { GET } = (await import('../../app/routes/applications/[id]/generation-runs')) as Record<
      string,
      unknown
    >
    const app = new Hono()
    app.get('/applications/:id/generation-runs', GET as never)
    const response = await app.request('/applications/7/generation-runs')
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(html).toContain('Generate updated documents')
    expect(html).toContain('candidate-analysis-changed')
    mockGetGenerationState.mockReturnValue({
      state: 'never-run',
      latest: null,
      latestCompleted: null,
      currentCompleted: null,
      staleCompleted: null,
      reasons: [],
    })
  })

  test('offers reconnection only when Google rejects the stored authorization', async () => {
    mockGetGoogleDriveConnectionStatus.mockResolvedValue({
      state: 'reconnect-required',
      message: 'Google Drive authorization expired or was revoked.',
    })
    const { GET } = (await import('../../app/routes/applications/[id]/generation-runs')) as Record<
      string,
      unknown
    >
    const app = new Hono()
    app.get('/applications/:id/generation-runs', GET as never)
    const response = await app.request('/applications/7/generation-runs')
    const html = await response.text()

    expect(html).toContain('Google Drive authorization expired or was revoked.')
    expect(html).toContain('href="/auth/google/start"')
    expect(html).toContain('Reconnect Google Drive')
    expect(html).not.toContain('Google Drive connection verified.')
    mockGetGoogleDriveConnectionStatus.mockResolvedValue({ state: 'not-connected' })
  })

  test('does not show reconnect after Google verifies the connection', async () => {
    mockGetGoogleDriveConnectionStatus.mockResolvedValue({ state: 'connected' })
    mockListGenerationRuns.mockReturnValue(runsWith(pendingArtifacts))
    const { GET } = (await import('../../app/routes/applications/[id]/generation-runs')) as Record<
      string,
      unknown
    >
    const app = new Hono()
    app.get('/applications/:id/generation-runs', GET as never)
    const response = await app.request('/applications/7/generation-runs')
    const html = await response.text()

    expect(html).toContain('Google Drive connection verified.')
    expect(html).toContain('2 files are ready to upload.')
    expect(html).toContain('Upload all pending files')
    expect(html).toContain('/applications/7/artifacts/upload-pending')
    expect(html).not.toContain('Reconnect Google Drive')
    mockGetGoogleDriveConnectionStatus.mockResolvedValue({ state: 'not-connected' })
    mockListGenerationRuns.mockReturnValue([])
  })

  test('uploads every pending artifact for only the current application', async () => {
    const artifacts = structuredClone(pendingArtifacts)
    mockListGenerationRuns.mockReturnValue(runsWith(artifacts))
    mockGetGoogleDriveConnectionStatus.mockResolvedValue({ state: 'connected' })
    mockUploadArtifactToGoogleDrive.mockClear()
    mockUploadArtifactToGoogleDrive.mockImplementation(async (artifact) => {
      artifact.googleDriveFileId = `drive-${artifact.id}`
    })
    const { POST } = (await import(
      '../../app/routes/applications/[id]/artifacts/upload-pending'
    )) as Record<string, unknown>
    const app = new Hono()
    app.post('/applications/:id/artifacts/upload-pending', POST as never)
    const response = await app.request('/applications/7/artifacts/upload-pending', {
      method: 'POST',
    })
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(mockUploadArtifactToGoogleDrive).toHaveBeenCalledTimes(2)
    expect(html).toContain('Uploaded 2 files.')
    expect(html).not.toContain('Upload all pending files')
    mockUploadArtifactToGoogleDrive.mockImplementation(async () => undefined)
    mockGetGoogleDriveConnectionStatus.mockResolvedValue({ state: 'not-connected' })
    mockListGenerationRuns.mockReturnValue([])
  })
})
