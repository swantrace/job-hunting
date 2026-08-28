import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { mockEnqueueGeneration, mockHasPendingSkillDecisions } from './support/runtime-mocks'

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

  test('blocks explicit generation while a missing-skill decision is pending', async () => {
    mockHasPendingSkillDecisions.mockReturnValue(true)
    const response = await (await generationRunsHarness()).request(
      '/applications/7/generation-runs',
      { method: 'POST' },
    )

    expect(response.status).toBe(422)
    expect(mockEnqueueGeneration).not.toHaveBeenCalled()
    mockHasPendingSkillDecisions.mockReturnValue(false)
  })
})
