import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { CareerGrowthList } from '../../app/components/CareerGrowth'
import type { CareerGrowthOpportunity } from '../../src/lib/career-growth'

function harness(opportunities: CareerGrowthOpportunity[]) {
  const app = new Hono()
  app.get('/', (c) => c.html(<CareerGrowthList opportunities={opportunities} />))
  return app.request('/')
}

describe('career growth list display', () => {
  test('shows a neutral accessible empty state', async () => {
    const html = await (await harness([])).text()
    expect(html).toContain('No recurring evidence gaps')
    expect(html).toContain('id="career-growth-list"')
  })

  test('escapes content and renders neutral labels', async () => {
    const html = await (
      await harness([
        {
          skillKey: 'fhir',
          skillName: 'FHIR & <HL7>',
          category: 'domain',
          directionCount: 2,
          activeApplicationCount: 3,
          requiredCount: 2,
          preferredCount: 1,
          mentionedCount: 0,
          verifiedEvidenceCount: 1,
          retainedCount: 1,
          latestActivityAt: '2026-08-31',
          score: 40,
          label: 'Verify existing evidence',
        },
      ])
    ).text()

    expect(html).toContain('FHIR &amp; &lt;HL7&gt;')
    expect(html).toContain('Verify existing evidence')
    expect(html).not.toContain('<HL7>')
  })
})
