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
      skillReferences: [
        {
          rawLabel: 'Apache Kafka',
          canonicalLabel: 'Kafka',
          category: 'messaging-async',
          confidence: 0.96,
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
  const { JobAnalysisDraft } = (await import('../../app/components/JobAnalysisDraft')) as Record<
    string,
    unknown
  >
  return renderJsx(
    (JobAnalysisDraft as (props: { analysis: JobAnalysis }) => unknown)({ analysis }),
  )
}

describe('requirement-owned skill references draft', () => {
  test('renders skill references inside the requirement, not as a separate region', async () => {
    const html = await renderDraft()

    expect(html).toContain('data-ja-requirement')
    expect(html).toContain('data-ja-skill-ref')
    expect(html).toContain('data-ja-skill-raw')
    expect(html).toContain('data-ja-skill-canonical')
    expect(html).toContain('data-ja-skill-category')
    expect(html).toContain('data-ja-skill-confidence')
    // No parallel top-level skillRequirements editor remains.
    expect(html).not.toContain('name="skillRequirements"')
  })

  test('preserves raw label and confidence in the authoritative draft', async () => {
    const html = await renderDraft()

    expect(html).toContain('Apache Kafka')
    expect(html).toContain('0.96')
    expect(html).toContain('name="jobAnalysis"')
  })
})
