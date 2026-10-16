import { describe, expect, test } from 'bun:test'
import { candidateFitSystemPrompt } from '../../src/ai/prompts/candidate-fit'
import { runDecisionSchema } from '../../src/db/analysis-decisions'
import { documentSafeCareerData, loadCareerData } from '../../src/lib/career/canonical-data'
import { parseDocumentDraft } from '../../src/lib/document-draft/definition'
import { validateTransferableSkillUsage } from '../../src/lib/document-draft/validation'
import {
  readReviewSnapshot,
  reviewSkillEvidence,
  skillDecisionBasis,
  skillReviewPolicyVersion,
} from '../../src/lib/skills/review-evidence'
import { skillDecisionSchema } from '../../src/lib/validation'
import { careerTestDatabase } from '../support/career-db'

function snapshot() {
  return readReviewSnapshot(
    JSON.stringify({
      sourceVersions: { skillReviewPolicy: skillReviewPolicyVersion },
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
describe('personal-skill review authority', () => {
  test('JavaScript stays proven when a composite requirement has additional unverified capabilities', () => {
    expect(candidateFitSystemPrompt).toContain('These labels assess the whole requirement')
    expect(candidateFitSystemPrompt).toContain('Do not instruct the user to Include or Skip')
    const input = snapshot()
    input.careerData!.skills[0]!.id = 'javascript'
    input.careerData!.achievements[0]!.claim = 'Built JavaScript applications'
    input.jobAnalysis!.requirements[0]!.statement =
      'Build responsive web applications using HTML, CSS, JavaScript, and Node.js, Python, or PHP'
    expect(reviewSkillEvidence('javascript', input)).toBe('direct')
    input.jobAnalysis!.requirements[0]!.statement =
      'Have experience with TypeScript/JavaScript, NodeJS, and React'
    expect(reviewSkillEvidence('javascript', input)).toBe('direct')
  })
  test('catalog existence and unrelated framework evidence never prove possession', () => {
    expect(reviewSkillEvidence('vuejs', snapshot())).toBe('unknown-evidence')
    expect(reviewSkillEvidence('access-management', snapshot())).toBe('unknown-evidence')
  })
  test('requires an eligible personal skill AND evidence tied to that skill', () => {
    expect(reviewSkillEvidence('react', snapshot())).toBe('direct')
    const input = snapshot()
    input.careerData!.skills[0]!.resumeEligible = false
    expect(reviewSkillEvidence('react', input)).toBe('unknown-evidence')
    const dangling = snapshot()
    dangling.careerData!.skills[0]!.evidence = ['achievement:missing']
    expect(reviewSkillEvidence('react', dangling)).toBe('unknown-evidence')
    dangling.careerData!.skills[0]!.evidence = ['skill:react']
    expect(reviewSkillEvidence('react', dangling)).toBe('unknown-evidence')
  })
  test('uses the real frozen flat career-data shape and resolves legacy bare evidence IDs', () => {
    const fixture = careerTestDatabase()
    try {
      const input = snapshot()
      input.careerData = documentSafeCareerData(loadCareerData())
      expect(reviewSkillEvidence('typescript', input)).toBe('direct')
      expect(reviewSkillEvidence('react', input)).toBe('unknown-evidence') // personal row has no evidence
    } finally {
      fixture.cleanup()
    }
  })
  test('personal evidence is readable in historical snapshots; absent facts fail closed', () => {
    expect(reviewSkillEvidence('react', null)).toBe('unknown-evidence')
    const old = snapshot()
    delete old.sourceVersions
    expect(reviewSkillEvidence('react', old)).toBe('direct')
    expect(skillDecisionBasis(10, 'react', old)).toBeNull()
  })
  test('all unverified Includes require a reason, even with a forged legacy basis', () => {
    expect(
      skillDecisionSchema.safeParse({
        action: 'include',
        reason: '',
        includeBasis: 'transferable',
      }).success,
    ).toBe(false)
    expect(
      runDecisionSchema.safeParse({
        decision: 'include',
        reason: null,
        includeBasis: 'transferable',
      }).success,
    ).toBe(false)
    expect(skillDecisionSchema.safeParse({ action: 'include', reason: '  ' }).success).toBe(false)
    expect(
      skillDecisionSchema.safeParse({ action: 'include', reason: 'Used in a prototype' }).success,
    ).toBe(true)
    expect(skillDecisionSchema.safeParse({ action: 'skip' }).success).toBe(true)
  })
})

describe('safe decision reuse fingerprint', () => {
  test('ignores model prose, confidence, run IDs and unrelated career edits', () => {
    const original = skillDecisionBasis(10, 'react', snapshot())
    expect(original).toBeTruthy()
    const input = snapshot()
    input.careerData!.achievements.push({
      id: 'unrelated',
      claim: 'Other work',
    } as never)
    expect(skillDecisionBasis(10, 'react', input)).toBe(original)
  })
  test('invalidates reuse for changed requirements or personal evidence', () => {
    const original = skillDecisionBasis(10, 'react', snapshot())
    const input = snapshot()
    input.jobAnalysis!.requirements[0]!.statement = 'Lead React architecture across teams'
    expect(skillDecisionBasis(10, 'react', input)).not.toBe(original)
    const edited = snapshot()
    edited.careerData!.achievements[0]!.claim = 'Built a small React prototype'
    expect(skillDecisionBasis(10, 'react', edited)).not.toBe(original)
    expect(skillDecisionBasis(10, 'react', null)).toBeNull()
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
