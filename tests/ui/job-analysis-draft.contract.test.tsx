import { describe, expect, test } from 'bun:test'
import type { JobAnalysis } from '../../src/ai/schemas/job-analysis'
import { classTokens, renderJsx } from './support/html-contract'

const analysis: JobAnalysis = {
  summary: {
    rolePurpose: 'Build and support educational SaaS features across the stack.',
    idealCandidate: 'A product engineer with React, TypeScript, and delivery experience.',
  },
  classification: {
    roleType: 'fullstack',
    advertisedSeniority: 'intermediate',
    practicalSeniority: 'strong-mid',
    rationale: 'The posting combines feature ownership with architecture and mentoring.',
    functionalEmphasis: {
      frontend: 30,
      backend: 30,
      testingQuality: 15,
      devopsInfrastructure: 10,
      collaborationOwnership: 15,
    },
  },
  requirements: [
    {
      type: 'skill',
      importance: 'required',
      basis: 'explicit',
      statement: 'Commercial SaaS experience with Node.js, TypeScript, and React.',
      sourceText: 'At least 3 years of experience building commercial SaaS applications.',
      inferenceRationale: null,
      skillReferences: [
        {
          rawLabel: 'React',
          canonicalLabel: 'React',
          category: 'frontend',
          confidence: 0.95,
        },
      ],
    },
    {
      type: 'responsibility',
      importance: 'required',
      basis: 'inferred',
      statement: 'Operate with strong-mid autonomy.',
      sourceText: 'Develop and deliver software features with minimal supervision.',
      inferenceRationale: 'Minimal supervision indicates meaningful independent ownership.',
      skillReferences: [],
    },
  ],
  painPoints: [],
  culture: [],
  redFlags: [],
  successMetrics: [],
  benefits: [],
  notes: null,
  interviewQuestions: ['What does production support look like for this team?'],
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

describe('structured job analysis review draft', () => {
  test('renders a single editable review region with a hidden authoritative JSON field', async () => {
    const html = await renderDraft()

    expect(html).toContain('id="job-analysis-draft"')
    expect(html).toContain('name="jobAnalysis"')
    expect(html).toContain('data-ja-role-purpose')
    expect(html).toContain('data-ja-role-type')
    expect(html).toContain('data-ja-fe="frontend"')
    expect(html).toMatch(/data-ja-requirement/g)
  })

  test('badges inferred requirements distinctly and preserves source excerpts read-only', async () => {
    const html = await renderDraft()

    expect(html).toContain('>Inferred<')
    expect(html).toContain('>Explicit<')
    // Source excerpts render as text, never as an editable control.
    expect(html).toContain('At least 3 years of experience building commercial SaaS applications.')
    expect(html).not.toMatch(/data-ja-source[^>]*value="[^"]*"[^>]*type=/)
  })

  test('uses current daisyUI 5 classes without legacy form-control tokens', async () => {
    const classes = classTokens(await renderDraft())
    const legacy = ['form-control', 'input-bordered', 'select-bordered', 'textarea-bordered']

    expect(classes).toContain('fieldset')
    expect(classes).toContain('textarea')
    expect(classes).toContain('select')
    expect(classes.filter((name) => legacy.includes(name))).toEqual([])
  })
})
