import { describe, expect, test } from 'bun:test'
import {
  basicResumeMetrics,
  buildResumeExperimentRequest,
  responseText,
  stripMarkdownFence,
} from '../src/lib/document-draft/experiment'

const input = {
  jd: 'Build TypeScript products.',
  baseResume: '# Candidate\n\n## Experience\n\n- Built web products.',
  careerContext: '{"skills":["typescript"]}',
  originalPrompt: 'Am I a fit, and how should I tailor my resume?',
}

describe('resume generation experiments', () => {
  test('isolates the intended input variable for every method', () => {
    const minimal = buildResumeExperimentRequest('base-minimal', input)
    const grounded = buildResumeExperimentRequest('base-grounded', input)
    const fromFacts = buildResumeExperimentRequest('career-grounded', input)
    const constrained = buildResumeExperimentRequest('base-constrained', input)
    const baselineMinimal = buildResumeExperimentRequest('baseline-minimal', {
      ...input,
      jd: undefined,
    })
    const baseline = buildResumeExperimentRequest('baseline-grounded', {
      ...input,
      jd: undefined,
    })
    const baselineCareerOnly = buildResumeExperimentRequest('baseline-career-only', {
      ...input,
      jd: undefined,
    })

    expect(minimal.input).toContain(input.baseResume)
    expect(minimal.input).not.toContain(input.careerContext)
    expect(grounded.input).toContain(input.baseResume)
    expect(grounded.input).toContain(input.careerContext)
    expect(fromFacts.input).not.toContain(input.baseResume)
    expect(fromFacts.input).toContain(input.careerContext)
    expect(constrained.instructions).toContain('Prefer omission')
    expect(constrained.input).toContain(input.baseResume)
    expect(constrained.input).toContain(input.careerContext)
    expect(baseline.input).toContain(input.baseResume)
    expect(baseline.input).toContain(input.careerContext)
    expect(baseline.input).not.toContain(input.jd)
    expect(baseline.input).toContain('There is no job description')
    expect(baselineMinimal.input).toContain(input.baseResume)
    expect(baselineMinimal.input).not.toContain(input.careerContext)
    expect(baselineCareerOnly.input).not.toContain(input.baseResume)
    expect(baselineCareerOnly.input).toContain(input.careerContext)
  })

  test('requires a job description for job-specific methods', () => {
    expect(() =>
      buildResumeExperimentRequest('base-grounded', { ...input, jd: undefined }),
    ).toThrow('requires a job description')
  })

  test('extracts all output text without assuming a fixed output index', () => {
    expect(
      responseText({
        output: [
          { type: 'reasoning' },
          { type: 'message', content: [{ type: 'output_text', text: '# Resume' }] },
          { type: 'message', content: [{ type: 'output_text', text: '## Experience' }] },
        ],
      }),
    ).toBe('# Resume\n\n## Experience')
  })

  test('uses the response output_text shortcut when available', () => {
    expect(responseText({ output_text: '  # Resume  ' })).toBe('# Resume')
  })

  test('removes only an outer Markdown fence and records basic metrics', () => {
    const markdown = stripMarkdownFence('```markdown\n# Candidate\n\n- Built APIs\n```')
    expect(markdown).toBe('# Candidate\n\n- Built APIs')
    expect(basicResumeMetrics(markdown)).toEqual({
      characters: 25,
      words: 3,
      headings: 1,
      bullets: 1,
    })
  })
})
