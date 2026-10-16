import { describe, expect, test } from 'bun:test'
import type { JobAnalysis } from '../../src/ai/schemas/job-analysis'
import { renderJsx } from './support/html-contract'

const analysis: JobAnalysis = {
  summary: {
    rolePurpose: 'Build event-driven platform services.',
    idealCandidate: 'An engineer with streaming and delivery experience.',
  },
  classification: {
    roleType: 'backend',
    advertisedSeniority: 'intermediate',
    practicalSeniority: 'strong-mid',
    rationale: 'The posting emphasizes distributed systems ownership.',
    functionalEmphasis: {
      frontend: 0,
      backend: 50,
      testingQuality: 15,
      devopsInfrastructure: 20,
      collaborationOwnership: 15,
    },
  },
  requirements: [
    {
      type: 'skill',
      importance: 'required',
      basis: 'explicit',
      statement: 'Experience building event-driven systems with Kafka.',
      sourceText: 'Experience building event-driven systems with Kafka',
      inferenceRationale: null,
      terms: [
        {
          term: 'Apache Kafka',
          sourceText: 'Experience building event-driven systems with Kafka',
          confidence: 0.96,
          key: null,
        },
      ],
    },
  ],
  painPoints: [],
  culture: [],
  redFlags: [],
  successMetrics: [],
  benefits: [],
  notes: null,
  interviewQuestions: [],
}

async function renderDraft() {
  const { JobAnalysisDraft } = (await import(
    '../../app/components/intake/JobAnalysisDraft'
  )) as Record<string, unknown>
  return renderJsx(
    (JobAnalysisDraft as (props: { analysis: JobAnalysis }) => unknown)({ analysis }),
  )
}

describe('requirement-owned raw skill terms draft', () => {
  test('renders raw terms inside the requirement, not as a separate mapping region', async () => {
    const html = await renderDraft()

    expect(html).toContain('data-ja-requirement')
    expect(html).toContain('data-ja-terms')
    expect(html).toContain('data-ja-term')
    // removes the model-owned canonical/category editor; adds the
    // reviewed mapping UI, so no parser-side mapping control may reappear here.
    expect(html).not.toContain('data-ja-skill-canonical')
    expect(html).not.toContain('data-ja-skill-category')
    expect(html).not.toContain('data-ja-skill-confidence')
    // No parallel top-level skillRequirements editor remains.
    expect(html).not.toContain('name="skillRequirements"')
  })

  test('preserves the raw term and confidence in the authoritative draft', async () => {
    const html = await renderDraft()

    expect(html).toContain('Apache Kafka')
    expect(html).toContain('0.96')
    expect(html).toContain('name="jobAnalysis"')
  })
})
