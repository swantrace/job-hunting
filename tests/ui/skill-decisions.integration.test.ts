import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { recordsFor } from './support/html-contract'
import { mockGetCandidateAnalysisState, mockListRunSkillReviews } from './support/runtime-mocks'

const requirement = {
  skillId: 12,
  skillName: 'Kafka',
  skillKey: 'kafka',
  category: 'messaging-async',
  careerSkillId: null,
  reviewStatus: 'pending',
  requirementId: 3,
  requirementSequence: 1,
  requirementStatement: 'Experience building event-driven systems with Kafka',
  importance: 'required',
  rawLabel: 'Apache Kafka',
  confidence: 0.96,
  analysisResult: 'not-in-career-data',
  decision: 'pending',
  decisionReason: null,
} as const

async function createRouteHarness() {
  const { POST } = (await import('../../app/routes/applications/[id]/skill-decisions')) as Record<
    string,
    unknown
  >
  const app = new Hono()
  app.post('/applications/:id/skill-decisions', POST as never)
  return app
}

function submit(action: string, extra: Record<string, string> = {}) {
  return (async () => {
    const app = await createRouteHarness()
    return app.request('/applications/7/skill-decisions', {
      method: 'POST',
      body: new URLSearchParams({ action, skillId: '12', ...extra }),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    })
  })()
}

describe('skill decision HTMX response boundaries', () => {
  test('returns the review panel and score fragments on a valid decision', async () => {
    mockListRunSkillReviews.mockReturnValue([requirement])
    mockGetCandidateAnalysisState.mockReturnValue({
      state: 'current',
      latest: { id: 1, status: 'Completed' },
      latestCompleted: { id: 1, status: 'Completed' },
      currentCompleted: { id: 1, status: 'Completed' },
      staleCompleted: null,
      reasons: [],
    })

    const response = await submit('skip')
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(recordsFor(html, 'skill-review-panel')).toHaveLength(1)
    expect(recordsFor(html, 'skill-readiness')).toHaveLength(1)
    expect(recordsFor(html, 'canonical-score')).toHaveLength(1)
    expect(recordsFor(html, 'application-coverage')).toHaveLength(1)
  })

  test('returns only the decision form on a 422 and retargets the swap', async () => {
    mockListRunSkillReviews.mockReturnValue([requirement])
    mockGetCandidateAnalysisState.mockReturnValue({
      state: 'current',
      latest: { id: 1, status: 'Completed' },
      latestCompleted: { id: 1, status: 'Completed' },
      currentCompleted: { id: 1, status: 'Completed' },
      staleCompleted: null,
      reasons: [],
    })

    const response = await submit('include', { reason: '' })
    const html = await response.text()

    expect(response.status).toBe(422)
    expect(response.headers.get('HX-Retarget')).toBe('#skill-decision-12')
    expect(recordsFor(html, 'skill-decision-12')).toHaveLength(1)
    expect(recordsFor(html, 'skill-review-panel')).toHaveLength(0)
  })
})
