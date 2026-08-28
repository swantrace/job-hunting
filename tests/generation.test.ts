import { describe, expect, test } from 'bun:test'
import {
  tailoredCoverLetterSchema,
  tailoredResumeSchema,
} from '../src/ai/schemas/application-generation'
import { recipientName, renderDocx } from '../src/lib/generation'
import { resolveProjectAsset } from '../src/lib/profiles'
import {
  generationEligibleRequirements,
  isGenerationEligible,
} from '../src/lib/skills/generation-eligibility'

describe('application generation', () => {
  test('accepts structured tailored document drafts', () => {
    expect(
      tailoredResumeSchema.safeParse({
        targetTitle: 'Full-Stack Developer',
        summary: 'Relevant experience.',
        skills: [{ label: 'Frontend', items: 'React, TypeScript' }],
        experienceBullets: [{ id: 'shift', bullets: ['Built production systems.'] }],
        selectedProjectIds: [],
      }).success,
    ).toBe(true)
    expect(
      tailoredCoverLetterSchema.safeParse({
        salutation: 'Hiring Manager',
        openingParagraph: 'I am applying for this role.',
        evidenceParagraphs: [{ text: 'My experience is relevant.' }],
        companyInterestParagraph: 'The work is compelling.',
        includeAuthorization: false,
        authorizationParagraph: '',
        closingParagraph: 'Thank you for your consideration.',
      }).success,
    ).toBe(true)
  })

  test('renders the existing resume DOCX template with loops', async () => {
    const buffer = await renderDocx(resolveProjectAsset('templates/resume.template.docx'), {
      candidateName: 'Test Candidate',
      location: 'Edmonton, AB',
      phone: '+1 555 555 5555',
      email: 'test@example.com',
      linkedin: 'https://www.linkedin.com/in/test',
      github: 'https://github.com/test',
      portfolio: 'https://example.com',
      targetTitle: 'Full-Stack Developer',
      summary: 'Relevant experience.',
      skills: [{ label: 'Frontend', items: 'React, TypeScript' }],
      experiences: [
        {
          role: 'Developer',
          company: 'Example',
          employmentLabel: 'Contract',
          displayDates: '2024 – 2025',
          bullets: [{ text: 'Built a feature.' }],
        },
      ],
      showSelectedProjects: false,
      selectedProjects: [],
      showPublications: false,
      publications: [],
      education: [{ degree: 'MCS', school: 'Example University', graduationYear: '2020' }],
    })
    expect(buffer.subarray(0, 2).toString()).toBe('PK')
  })

  test('normalizes a model salutation for the letter template', () => {
    expect(recipientName('Dear Hiring Team,')).toBe('Hiring Team')
    expect(recipientName('Hiring Manager')).toBe('Hiring Manager')
  })

  test('does not enqueue document generation when an AI-parsed opportunity is saved', () => {
    // The save path persists requirements without a generation run; pending and
    // skipped requirements stay outside the generation-eligible boundary.
    expect(
      isGenerationEligible({ analysisResult: 'not-in-career-data', userDecision: 'pending' }),
    ).toBe(false)
    expect(
      isGenerationEligible({ analysisResult: 'not-in-career-data', userDecision: 'skip' }),
    ).toBe(false)
  })

  test('blocks explicit generation while a missing-skill decision is pending', () => {
    expect(
      isGenerationEligible({ analysisResult: 'not-in-career-data', userDecision: 'pending' }),
    ).toBe(false)
    expect(
      isGenerationEligible({ analysisResult: 'not-in-career-data', userDecision: 'include' }),
    ).toBe(true)
    expect(isGenerationEligible({ analysisResult: 'proven-match', userDecision: 'pending' })).toBe(
      true,
    )
  })

  test('allows application-only skills to use only the user-authored reason', () => {
    const eligible = generationEligibleRequirements([
      {
        analysisResult: 'not-in-career-data',
        userDecision: 'include',
        decisionReason: 'Used in a personal event-processing prototype.',
      },
      { analysisResult: 'not-in-career-data', userDecision: 'include', decisionReason: 'Learning' },
    ])
    expect(eligible).toHaveLength(2)
    expect(eligible[0].decisionReason).toBe('Used in a personal event-processing prototype.')
  })

  test('never sends skipped skills to resume or cover-letter prompts', () => {
    const eligible = generationEligibleRequirements([
      { analysisResult: 'proven-match', userDecision: 'pending', skillName: 'TypeScript' },
      { analysisResult: 'not-in-career-data', userDecision: 'skip', skillName: 'Kafka' },
      { analysisResult: 'not-in-career-data', userDecision: 'pending', skillName: 'Redis' },
      { analysisResult: 'not-in-career-data', userDecision: 'include', skillName: 'Kubernetes' },
    ])
    expect(eligible.map((item) => item.skillName)).toEqual(['TypeScript', 'Kubernetes'])
  })
})
