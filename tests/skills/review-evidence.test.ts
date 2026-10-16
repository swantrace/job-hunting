import { describe, expect, test } from 'bun:test'
import type { RequirementAssessment } from '../../src/ai/schemas/candidate-fit'
import { documentSafeCareerData, loadCareerData } from '../../src/lib/career/canonical-data'
import { parseDocumentDraft } from '../../src/lib/document-draft/definition'
import { validateTransferableSkillUsage } from '../../src/lib/document-draft/validation'
import {
  readReviewSnapshot,
  reviewSkillEvidence,
  skillDecisionBasis,
} from '../../src/lib/skills/review-evidence'
import { skillDecisionSchemaFor } from '../../src/lib/validation'
import { careerTestDatabase } from '../support/career-db'

function snapshot() {
  return readReviewSnapshot(
    JSON.stringify({
      sourceVersions: { skillReviewPolicy: 1 },
      application: { direction: 'fullstack' },
      jobAnalysis: {
        requirements: [
          {
            id: 1,
            statement: 'Build React interfaces',
            sourceText: 'Build React interfaces',
            importance: 'required',
            type: 'skill',
            basis: 'explicit',
          },
        ],
      },
      skillRequirements: [{ skillId: 10, requirementId: 1 }],
      careerData: {
        skills: [{ id: 'react', resumeEligible: true, evidence: ['achievement:react-ui'] }],
        achievements: [{ id: 'react-ui', claim: 'Built React UI', safeToUse: true }],
      },
    }),
  )!
}
const assessment = (
  status: RequirementAssessment['evidenceStatus'] = 'direct',
): RequirementAssessment => ({
  jobRequirementId: 1,
  evidenceStatus: status,
  evidenceRefs: [
    {
      sourceType: 'achievement',
      sourceId: 'react-ui',
      relevance: status === 'transferable' ? 'transferable' : 'direct',
    },
  ],
  explanation: 'React evidence supports this requirement.',
  confidence: 0.9,
})

describe('personal-skill review authority', () => {
  test('catalog existence and unrelated framework evidence never prove possession', () => {
    expect(reviewSkillEvidence('vuejs', snapshot(), assessment())).toBe('unknown-evidence')
    expect(reviewSkillEvidence('access-management', snapshot(), assessment())).toBe(
      'unknown-evidence',
    )
    expect(reviewSkillEvidence('vuejs', snapshot(), assessment('transferable'))).toBe(
      'unknown-evidence',
    )
  })
  test('requires an eligible personal skill AND evidence tied to that skill', () => {
    expect(reviewSkillEvidence('react', snapshot(), assessment())).toBe('direct')
    const other = assessment()
    other.evidenceRefs[0]!.sourceId = 'unrelated-project'
    expect(reviewSkillEvidence('react', snapshot(), other)).toBe('unknown-evidence')
    const input = snapshot()
    input.careerData!.skills[0]!.resumeEligible = false
    expect(reviewSkillEvidence('react', input, assessment())).toBe('unknown-evidence')
  })
  test('uses the real frozen flat career-data shape and resolves legacy bare evidence IDs', () => {
    const fixture = careerTestDatabase()
    try {
      const input = snapshot()
      input.careerData = documentSafeCareerData(loadCareerData())
      const result = assessment()
      result.evidenceRefs = [
        { sourceType: 'achievement', sourceId: 'reporting-api-delivery', relevance: 'direct' },
      ]
      expect(reviewSkillEvidence('typescript', input, result)).toBe('direct')
      expect(reviewSkillEvidence('react', input, result)).toBe('unknown-evidence') // personal row has no evidence
      result.evidenceStatus = 'transferable'
      result.evidenceRefs[0]!.relevance = 'transferable'
      expect(reviewSkillEvidence('typescript', input, result)).toBe('transferable')
    } finally {
      fixture.cleanup()
    }
  })
  test('transferable evidence still requires a decision; missing/legacy snapshots fail closed', () => {
    expect(reviewSkillEvidence('react', snapshot(), assessment('transferable'))).toBe(
      'transferable',
    )
    expect(reviewSkillEvidence('react', null, assessment())).toBe('unknown-evidence')
    const old = snapshot()
    delete old.sourceVersions
    expect(reviewSkillEvidence('react', old, assessment())).toBe('unknown-evidence')
  })
  test('only server-confirmed transferable includes permit an empty reason', () => {
    expect(skillDecisionSchemaFor(true).safeParse({ action: 'include', reason: '' }).success).toBe(
      true,
    )
    expect(
      skillDecisionSchemaFor().safeParse({
        action: 'include',
        reason: '',
        includeBasis: 'transferable',
      }).success,
    ).toBe(false)
  })
})

describe('safe decision reuse fingerprint', () => {
  test('ignores model prose, confidence, run IDs and unrelated career edits', () => {
    const original = skillDecisionBasis(10, 'react', snapshot(), [assessment()])
    expect(original).toBeTruthy()
    const changed = assessment()
    changed.explanation = 'Different model wording'
    changed.confidence = 0.7
    const input = snapshot()
    input.careerData!.achievements.push({
      id: 'unrelated',
      claim: 'Other work',
    } as never)
    expect(skillDecisionBasis(10, 'react', input, [changed])).toBe(original)
  })
  test('invalidates reuse for changed requirements, evidence, or assessment kind', () => {
    const original = skillDecisionBasis(10, 'react', snapshot(), [assessment()])
    const input = snapshot()
    input.jobAnalysis!.requirements[0]!.statement = 'Lead React architecture across teams'
    expect(skillDecisionBasis(10, 'react', input, [assessment()])).not.toBe(original)
    const edited = snapshot()
    edited.careerData!.achievements[0]!.claim = 'Built a small React prototype'
    expect(skillDecisionBasis(10, 'react', edited, [assessment()])).not.toBe(original)
    expect(skillDecisionBasis(10, 'react', snapshot(), [assessment('transferable')])).not.toBe(
      original,
    )
    expect(skillDecisionBasis(10, 'react', null, [assessment()])).toBeNull()
  })
})

test('transferable terms are limited to qualified resume Skills entries', () => {
  expect(
    validateTransferableSkillUsage(
      parseDocumentDraft('## Skills\nTransferable familiarity with React', 'resume'),
      ['React'],
    ),
  ).toEqual([])
  expect(
    validateTransferableSkillUsage(
      parseDocumentDraft('## Experience\nBuilt React applications', 'resume'),
      ['React'],
    ),
  ).toHaveLength(1)
  expect(
    validateTransferableSkillUsage(parseDocumentDraft('## Skills\nReact', 'resume'), ['React']),
  ).toHaveLength(1)
  expect(
    validateTransferableSkillUsage(
      parseDocumentDraft('## Opening\nI have React experience', 'cover-letter'),
      ['React'],
    ),
  ).toHaveLength(1)
})
