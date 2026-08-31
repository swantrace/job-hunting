import { describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'

const statusModule = resolve(process.cwd(), 'src/lib/evidence/status.ts')
const schemaModule = resolve(process.cwd(), 'src/ai/schemas/candidate-fit.ts')

type StatusModule = {
  evidenceStatusLabels: Record<string, string>
  evidenceStatusBadges: Record<string, string>
  normalizeEvidenceStatus: (value: unknown) => string | null
  parseCandidateFitResult: (
    json: string | null | undefined,
  ) => { requirementAssessments: Array<{ evidenceStatus: string }> } | null
}

/**
 * A persisted v1.0.0 candidate-fit result: it still uses the historical
 * `missing` evidence status and must remain readable after the v1.1.0 contract.
 */
function legacyV1Fit() {
  return {
    fitRecommendation: 'apply',
    recommendationRationale: 'Direct engineering evidence matches the core stack.',
    profileRecommendation: {
      recommendedProfileId: 'fullstack',
      rationale: 'The role balances React and Node.js responsibilities.',
      alternatives: [],
    },
    requirementAssessments: [
      {
        jobRequirementId: 7,
        evidenceStatus: 'missing',
        evidenceRefs: [],
        explanation: 'No verified mentoring evidence is available in the supplied career data.',
        confidence: 0.91,
      },
    ],
    strengths: [],
    concerns: [],
    interviewPreparation: [],
    careerDataSuggestions: [],
  }
}

describe('evidence status domain contract', () => {
  test('labels the three evidence statuses without a "missing" outcome', async () => {
    const { evidenceStatusLabels, evidenceStatusBadges } = (await import(
      statusModule
    )) as StatusModule

    expect(evidenceStatusLabels.direct).toBe('Direct')
    expect(evidenceStatusLabels.transferable).toBe('Transferable')
    expect(evidenceStatusLabels['unknown-evidence']).toBe('Unverified in career data')
    expect(JSON.stringify(evidenceStatusLabels)).not.toMatch(/missing/i)
    expect(evidenceStatusBadges['unknown-evidence']).not.toBe('badge-error')
  })

  test('normalizes a persisted v1.0.0 missing status to unknown-evidence', async () => {
    const { normalizeEvidenceStatus, parseCandidateFitResult } = (await import(
      statusModule
    )) as StatusModule

    expect(normalizeEvidenceStatus('missing')).toBe('unknown-evidence')
    expect(normalizeEvidenceStatus('direct')).toBe('direct')
    expect(normalizeEvidenceStatus('transferable')).toBe('transferable')
    expect(normalizeEvidenceStatus('unknown-evidence')).toBe('unknown-evidence')
    expect(normalizeEvidenceStatus('invented')).toBeNull()

    const parsed = parseCandidateFitResult(JSON.stringify(legacyV1Fit()))
    expect(parsed?.requirementAssessments[0].evidenceStatus).toBe('unknown-evidence')
  })

  test('accepts unknown-evidence and rejects missing for new model output', async () => {
    const { candidateFitSchema } = await import(schemaModule)

    const accepted = legacyV1Fit()
    accepted.requirementAssessments[0].evidenceStatus = 'unknown-evidence'
    expect(candidateFitSchema.safeParse(accepted).success).toBe(true)

    const rejected = legacyV1Fit()
    rejected.requirementAssessments[0].evidenceStatus = 'missing'
    expect(candidateFitSchema.safeParse(rejected).success).toBe(false)
  })
})
