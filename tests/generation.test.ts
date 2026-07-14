import { describe, expect, test } from 'bun:test'
import {
  tailoredCoverLetterSchema,
  tailoredResumeSchema,
} from '../src/ai/schemas/application-generation'
import { renderDocx } from '../src/lib/generation'
import { getProfile, resolveProjectAsset } from '../src/lib/profiles'

describe('application generation', () => {
  test('accepts structured tailored document drafts', () => {
    expect(
      tailoredResumeSchema.safeParse({
        targetTitle: 'Full-Stack Developer',
        summary: 'Relevant experience.',
        skills: [{ label: 'Frontend', items: 'React, TypeScript' }],
        experienceBullets: [{ id: 'shift', bullets: ['Built production systems.'] }],
      }).success,
    ).toBe(true)
    expect(
      tailoredCoverLetterSchema.safeParse({
        salutation: 'Hiring Manager',
        openingParagraph: 'I am applying for this role.',
        evidenceParagraph: 'My experience is relevant.',
        companyInterestParagraph: 'The work is compelling.',
        closingParagraph: 'Thank you for your consideration.',
      }).success,
    ).toBe(true)
  })

  test('renders the existing resume DOCX template with loops', async () => {
    const profile = getProfile('fullstack')
    const buffer = await renderDocx(resolveProjectAsset(profile.templates.resume), {
      candidateName: 'Test Candidate',
      location: 'Edmonton, AB',
      phone: '+1 555 555 5555',
      email: 'test@example.com',
      linkedin: 'https://www.linkedin.com/in/test',
      github: 'https://github.com/test',
      targetTitle: profile.targetTitle,
      summary: profile.summary,
      skills: profile.skills,
      experiences: profile.experiences.map((experience) => ({
        ...experience,
        bullets: experience.bullets.map((bullet) => ({ text: bullet.text })),
      })),
      education: profile.education,
    })
    expect(buffer.subarray(0, 2).toString()).toBe('PK')
  })
})
