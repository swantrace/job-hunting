import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const auditPath = resolve(process.cwd(), 'src/lib/ats-audit.ts')
const contractTest = existsSync(auditPath) ? test : test.todo

describe('deterministic ATS and keyword audit', () => {
  contractTest('separates exact, alias, evidenced-missing, and unsupported terms', async () => {
    const { auditResumeKeywords } = await import(auditPath)
    const result = auditResumeKeywords({
      requiredTerms: [
        { canonical: 'Node.js', aliases: ['nodejs'], evidenceEligible: true },
        { canonical: 'Automated Testing', aliases: ['automated tests'], evidenceEligible: true },
        { canonical: 'Mentoring', aliases: ['mentor'], evidenceEligible: false },
      ],
      resumeText: 'Built Node.js services and automated tests for production applications.',
    })

    expect(result.exactMatches.map((item: { canonical: string }) => item.canonical)).toContain(
      'Node.js',
    )
    expect(result.aliasMatches.map((item: { canonical: string }) => item.canonical)).toContain(
      'Automated Testing',
    )
    expect(result.unsupportedTerms.map((item: { canonical: string }) => item.canonical)).toContain(
      'Mentoring',
    )
    expect(result).not.toHaveProperty('vendorAtsScore')
    expect(result).not.toHaveProperty('overallFitScore')
  })

  contractTest(
    'never recommends inserting a term without generation-eligible evidence',
    async () => {
      const { auditResumeKeywords } = await import(auditPath)
      const result = auditResumeKeywords({
        requiredTerms: [{ canonical: 'Kafka', aliases: [], evidenceEligible: false }],
        resumeText: 'TypeScript application development.',
      })

      expect(result.safeAdditions).toEqual([])
      expect(result.unsupportedTerms).toHaveLength(1)
    },
  )

  contractTest('matches punctuation-sensitive terms without confusing C, C++, and C#', async () => {
    const { auditResumeKeywords } = await import(auditPath)
    const result = auditResumeKeywords({
      requiredTerms: [
        { canonical: '.NET', aliases: [], evidenceEligible: true },
        { canonical: 'C', aliases: [], evidenceEligible: true },
        { canonical: 'C++', aliases: [], evidenceEligible: true },
        { canonical: 'C#', aliases: [], evidenceEligible: true },
      ],
      resumeText: 'Built services in C# and C++ on .NET, plus a CLI in C.',
    })

    expect(result.exactMatches.map((item: { canonical: string }) => item.canonical)).toContain(
      '.NET',
    )
    expect(result.exactMatches.map((item: { canonical: string }) => item.canonical)).toContain('C')
    expect(result.exactMatches.map((item: { canonical: string }) => item.canonical)).toContain(
      'C++',
    )
    expect(result.exactMatches.map((item: { canonical: string }) => item.canonical)).toContain('C#')
  })
})
