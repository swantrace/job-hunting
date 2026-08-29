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
      { evidenceStatus: 'missing', importance: 'preferred' },
      { evidenceStatus: 'missing', importance: 'mentioned' },
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
      { evidenceStatus: 'missing', importance: 'mentioned' },
    ])

    expect(result.directCoverage.percentage).toBeNull()
    expect(result.supportedCoverage.percentage).toBeNull()
  })
})
