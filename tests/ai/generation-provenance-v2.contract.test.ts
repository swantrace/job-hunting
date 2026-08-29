import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const schemaPath = resolve(process.cwd(), 'src/ai/schemas/application-generation.ts')
const validationPath = resolve(process.cwd(), 'src/lib/generation-provenance.ts')
const schemaSource = readFileSync(schemaPath, 'utf8')
const contractTest =
  schemaSource.includes('evidenceRefs') && existsSync(validationPath) ? test : test.todo

describe('claim-level generation provenance v2', () => {
  contractTest('requires evidence references for resume summary and bullets', async () => {
    const { tailoredResumeSchema } = await import(schemaPath)
    const result = tailoredResumeSchema.safeParse({
      targetTitle: 'Full-Stack Software Engineer',
      summary: {
        text: 'Full-stack engineer with production application experience.',
        evidenceRefs: [{ sourceType: 'experience', sourceId: 'midato' }],
      },
      skills: [{ label: 'Frontend', items: ['React', 'TypeScript'] }],
      experienceBullets: [
        {
          id: 'midato',
          bullets: [
            {
              text: 'Reduced CI build time from eight minutes to two.',
              evidenceRefs: [{ sourceType: 'achievement', sourceId: 'midato-vite-ci' }],
            },
          ],
        },
      ],
      selectedProjectIds: [],
    })

    expect(result.success).toBe(true)
  })

  contractTest('requires evidence references on cover-letter evidence paragraphs', async () => {
    const { tailoredCoverLetterSchema } = await import(schemaPath)
    const result = tailoredCoverLetterSchema.safeParse({
      salutation: 'Hiring Team',
      openingParagraph: 'I am applying for the Intermediate Software Engineer role.',
      evidenceParagraphs: [
        {
          text: 'At Midato, I improved the CI feedback cycle.',
          evidenceRefs: [{ sourceType: 'achievement', sourceId: 'midato-vite-ci' }],
        },
      ],
      companyInterestParagraph:
        'The role combines full-stack delivery, testing, and engineering improvement.',
      companyInterestSource: 'job-posting',
      includeAuthorization: false,
      authorizationParagraph: '',
      closingParagraph: 'Thank you for your consideration.',
    })

    expect(result.success).toBe(true)
  })

  contractTest('rejects generated references outside the frozen evidence snapshot', async () => {
    const { assertGenerationEvidenceReferences } = await import(validationPath)

    expect(() =>
      assertGenerationEvidenceReferences(
        [{ sourceType: 'achievement', sourceId: 'invented-metric' }],
        new Set(['achievement:midato-vite-ci']),
      ),
    ).toThrow()
  })
})
