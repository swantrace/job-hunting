import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { recordsFor } from './support/html-contract'
import {
  mockConfirmProfileSelection,
  mockCurrentCandidateAnalysisHash,
  mockGetAnalysisRun,
  mockListAnalysisRuns,
} from './support/runtime-mocks'

async function profileSelectionHarness() {
  const { POST, GET } = (await import(
    '../../app/routes/applications/[id]/profile-selection'
  )) as Record<string, unknown>
  const app = new Hono()
  app.post('/applications/:id/profile-selection', POST as never)
  app.get('/applications/:id/profile-selection', GET as never)
  return app
}

describe('profile selection confirmation boundaries', () => {
  test('rejects a forged profile ID with 422', async () => {
    mockListAnalysisRuns.mockReturnValue([])
    const response = await (await profileSelectionHarness()).request(
      '/applications/7/profile-selection',
      {
        method: 'POST',
        body: new URLSearchParams({ runId: '1', profileId: 'invented-profile' }),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
      },
    )

    expect(response.status).toBe(422)
    expect(recordsFor(await response.text(), 'profile-recommendation')).toHaveLength(1)
    expect(mockConfirmProfileSelection).not.toHaveBeenCalled()
  })

  test('refuses to confirm a non-completed run', async () => {
    mockGetAnalysisRun.mockReturnValue({
      id: 1,
      jobApplicationId: 7,
      status: 'Processing',
      inputHash: 'current-hash',
    })
    mockCurrentCandidateAnalysisHash.mockReturnValue('current-hash')
    mockConfirmProfileSelection.mockClear()

    const response = await (await profileSelectionHarness()).request(
      '/applications/7/profile-selection',
      {
        method: 'POST',
        body: new URLSearchParams({ runId: '1', profileId: 'fullstack' }),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
      },
    )

    expect(response.status).toBe(422)
    expect(mockConfirmProfileSelection).not.toHaveBeenCalled()
    mockGetAnalysisRun.mockReturnValue(null)
  })

  test('confirms a completed, non-stale run and updates the application direction', async () => {
    mockGetAnalysisRun.mockReturnValue({
      id: 1,
      jobApplicationId: 7,
      status: 'Completed',
      inputHash: 'current-hash',
    })
    mockCurrentCandidateAnalysisHash.mockReturnValue('current-hash')
    mockListAnalysisRuns.mockReturnValue([
      {
        id: 1,
        status: 'Completed',
        resultJson: JSON.stringify({
          fitRecommendation: 'apply',
          recommendationRationale: 'Good fit.',
          profileRecommendation: {
            recommendedProfileId: 'fullstack',
            rationale: 'Balanced role.',
            alternatives: [],
          },
          requirementAssessments: [],
          strengths: [],
          concerns: [],
          interviewPreparation: [],
          careerDataSuggestions: [],
        }),
      },
    ])
    mockConfirmProfileSelection.mockClear()

    const response = await (await profileSelectionHarness()).request(
      '/applications/7/profile-selection',
      {
        method: 'POST',
        body: new URLSearchParams({ runId: '1', profileId: 'fullstack' }),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
      },
    )
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(mockConfirmProfileSelection).toHaveBeenCalledWith(1, 'fullstack')
    expect(html).toContain('profile-recommendation')
    expect(html).not.toMatch(/<AppShell|<html|<body/)
    mockGetAnalysisRun.mockReturnValue(null)
    mockListAnalysisRuns.mockReturnValue([])
  })
})
