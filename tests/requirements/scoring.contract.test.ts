import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const scorePath = resolve(process.cwd(), 'src/lib/requirements/score.ts')
const contractTest = existsSync(scorePath) ? test : test.todo

describe('deterministic requirement evidence coverage', () => {
  contractTest('reports direct and supported coverage separately', async () => {
    const { calculateRequirementCoverage } = await import(scorePath)
    const result = calculateRequirementCoverage([
      { evidenceStatus: 'direct', importance: 'required' },
      { evidenceStatus: 'transferable', importance: 'required' },
      { evidenceStatus: 'unknown-evidence', importance: 'preferred' },
      { evidenceStatus: 'unknown-evidence', importance: 'mentioned' },
    ])

    expect(result.directCoverage).toEqual({
      matchedWeight: 3,
      totalWeight: 7,
      percentage: expect.closeTo(42.857, 2),
    })
    expect(result.supportedCoverage).toEqual({
      matchedWeight: 6,
      totalWeight: 7,
      percentage: expect.closeTo(85.714, 2),
    })
  })

  contractTest('excludes mentioned requirements from the denominator', async () => {
    const { calculateRequirementCoverage } = await import(scorePath)
    const result = calculateRequirementCoverage([
      { evidenceStatus: 'unknown-evidence', importance: 'mentioned' },
    ])

    expect(result.directCoverage.percentage).toBeNull()
    expect(result.supportedCoverage.percentage).toBeNull()
  })

  contractTest(
    'keeps direct and transferable evidence deterministic without double counting',
    async () => {
      const { calculateRequirementCoverage } = await import(scorePath)
      const result = calculateRequirementCoverage([
        { evidenceStatus: 'transferable', importance: 'required' },
        { evidenceStatus: 'transferable', importance: 'preferred' },
        { evidenceStatus: 'unknown-evidence', importance: 'required' },
      ])

      expect(result.directCoverage.matchedWeight).toBe(0)
      expect(result.supportedCoverage.matchedWeight).toBe(4)
      expect(result.supportedCoverage.totalWeight).toBe(7)
      expect(calculateRequirementCoverage([]).directCoverage.percentage).toBeNull()
    },
  )

  contractTest(
    'counts one semantic requirement once regardless of how many skills map to it',
    async () => {
      const { requirementCoverageFromAssessments } = (await import(scorePath)) as {
        requirementCoverageFromAssessments: (
          assessments: Array<{ jobRequirementId: number; evidenceStatus: string }>,
          importanceById: ReadonlyMap<number, string>,
        ) => {
          directCoverage: { matchedWeight: number; totalWeight: number; percentage: number | null }
        }
      }
      // Two skills map to requirement 41, but the assessment list has exactly
      // one entry for that requirement, so its weight contributes once.
      const coverage = requirementCoverageFromAssessments(
        [{ jobRequirementId: 41, evidenceStatus: 'direct' }],
        new Map([[41, 'required']]),
      )

      expect(coverage.directCoverage.matchedWeight).toBe(3)
      expect(coverage.directCoverage.totalWeight).toBe(3)
      expect(coverage.directCoverage.percentage).toBe(100)
    },
  )
})
