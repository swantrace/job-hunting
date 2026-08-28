import { describe, expect, test } from 'bun:test'
import {
  tailoredCoverLetterSchema,
  tailoredResumeSchema,
} from '../src/ai/schemas/application-generation'
import { recipientName, renderDocx } from '../src/lib/generation'
import { resolveProjectAsset } from '../src/lib/profiles'

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

  test.todo('does not enqueue document generation when an AI-parsed opportunity is saved', () => {})
  test.todo('blocks explicit generation while a missing-skill decision is pending', () => {})
  test.todo('allows application-only skills to use only the user-authored reason', () => {})
  test.todo('never sends skipped skills to resume or cover-letter prompts', () => {})
})
