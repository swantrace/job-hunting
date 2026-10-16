import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { auditResumeKeywords } from '../../src/lib/ats-audit'
import { baseResumeTextHash } from '../../src/lib/career/base-resumes'
import {
  baseResumeIdentity,
  baseResumeSourceFor,
  buildBaselineDocumentDraftSnapshot,
  buildDocumentDraftSnapshot,
  documentDraftAuditTerms,
} from '../../src/lib/document-draft/input'
import { approvedBaseResumeMarkdown } from '../career/fixtures'
import { type CareerTestDatabase, careerTestDatabase } from '../support/career-db'

let database: CareerTestDatabase

beforeAll(() => {
  database = careerTestDatabase()
})

afterAll(() => {
  database.cleanup()
})

const applicationSource = {
  application: {
    id: 1,
    direction: 'fullstack',
    jobTitle: 'Full-Stack Developer',
    location: 'Edmonton, AB',
    url: 'https://example.com/jobs/1',
  },
  company: { name: 'Example Company' },
  jobPosting: { contentHash: 'abc123', rawText: 'Build TypeScript products with FHIR.' },
  jobRequirements: [
    {
      sequence: 1,
      requirementType: 'skill',
      importance: 'required',
      basis: 'explicit',
      statement: 'TypeScript',
      sourceText: 'TypeScript',
    },
  ],
  requirements: [
    {
      skillName: 'TypeScript',
      importance: 'required',
      analysisResult: 'proven-match',
      decision: 'pending',
      decisionReason: null,
      rawLabel: 'TypeScript',
      requirementStatement: 'TypeScript',
    },
    {
      skillName: 'Kafka',
      importance: 'preferred',
      analysisResult: 'not-in-career-data',
      decision: 'skip',
      decisionReason: null,
      rawLabel: 'Kafka',
      requirementStatement: 'Kafka',
    },
  ],
}

describe('base-grounded document draft input', () => {
  test('exposes Base Resume identity for freshness without a filesystem path', () => {
    const identity = baseResumeIdentity('fullstack')
    expect(identity.baseResumeHash).toBe(baseResumeTextHash(approvedBaseResumeMarkdown))
    expect(identity.baseResumeVersion).toBe('v1')
    expect(baseResumeIdentity('fhir')).toEqual({ baseResumeHash: null, baseResumeVersion: null })
    expect(baseResumeSourceFor('fullstack')?.text).toContain('Synthetic approved Base Resume')
  })

  test('application snapshot combines JD, metadata, decisions, and complete safe career data', () => {
    const snapshot = buildDocumentDraftSnapshot(applicationSource)
    expect(snapshot.kind).toBe('application')
    expect(snapshot.baseResume?.direction).toBe('fullstack')
    expect(snapshot.application?.jobTitle).toBe('Full-Stack Developer')
    expect(snapshot.application?.company).toBe('Example Company')
    expect(snapshot.jobPosting?.rawText).toContain('FHIR')
    expect(snapshot.requirements.map((item) => item.skillName)).toEqual(['TypeScript'])
    expect(snapshot.excludedSkills).toContain('Kafka')
    expect(snapshot.direction).toBe('fullstack')
    expect(snapshot.documentPolicy.resume.maxWords).toBe(750)
    expect(snapshot.documentPolicy.coverLetter.maxWords).toBe(400)
    expect(snapshot.careerData.experiences.length).toBeGreaterThan(0)
    expect(snapshot.careerData.skills.length).toBeGreaterThan(0)
  })

  test('audit terms keep eligible requirements and mark excluded skills unclaimable', () => {
    const terms = documentDraftAuditTerms(buildDocumentDraftSnapshot(applicationSource))

    expect(terms.find((term) => term.canonical === 'TypeScript')).toMatchObject({
      evidenceEligible: true,
      importance: 'required',
    })
    // Kafka was skipped, so no evidence supports it and it must never be added.
    expect(terms.find((term) => term.canonical === 'Kafka')).toMatchObject({
      evidenceEligible: false,
      importance: 'required',
    })
    expect(new Set(terms.map((term) => term.canonical.toLowerCase())).size).toBe(terms.length)
  })

  test('the keyword audit separates matched, safely additive and unclaimable terms', () => {
    const requiredTerms = documentDraftAuditTerms(buildDocumentDraftSnapshot(applicationSource))

    const matched = auditResumeKeywords({
      requiredTerms,
      resumeText: 'Built TypeScript services.',
    })
    expect(matched.exactMatches.map((match) => match.canonical)).toEqual(['TypeScript'])
    expect(matched.unsupportedTerms.map((match) => match.canonical)).toEqual(['Kafka'])
    expect(matched.safeAdditions).toEqual([])
    // The unclaimable term still counts in the denominator (required weight 3).
    expect(matched.coverage).toEqual({ matchedWeight: 3, totalWeight: 6, percentage: 50 })

    const absent = auditResumeKeywords({ requiredTerms, resumeText: 'Nothing relevant.' })
    expect(absent.missingButSupported.map((match) => match.canonical)).toEqual(['TypeScript'])
    expect(absent.safeAdditions.map((match) => match.canonical)).toEqual(['TypeScript'])
    expect(absent.unsupportedTerms.map((match) => match.canonical)).toEqual(['Kafka'])
    expect(absent.coverage).toEqual({ matchedWeight: 0, totalWeight: 6, percentage: 0 })
  })

  test('baseline snapshot never invents an employer or a job description', () => {
    const snapshot = buildBaselineDocumentDraftSnapshot({
      direction: 'fullstack',
      targetTitle: 'Engineer',
    })
    expect(snapshot.kind).toBe('baseline')
    expect(snapshot.application).toBeNull()
    expect(snapshot.jobPosting).toBeNull()
    expect(snapshot.jobRequirements).toEqual([])
    expect(snapshot.requirements).toEqual([])
    expect(snapshot.documentPolicy.resume.summaryMaxWords).toBe(90)
    expect(snapshot.baseResume?.direction).toBe('fullstack')
    expect(snapshot.careerData.experiences.length).toBeGreaterThan(0)
  })

  test('fails fast when the direction has no approved Base Resume', () => {
    expect(() =>
      buildDocumentDraftSnapshot({
        ...applicationSource,
        application: { ...applicationSource.application, direction: 'fhir' },
      }),
    ).toThrow('No approved Base Resume')
  })
})
