import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const constantsModule = resolve(process.cwd(), 'src/lib/skills/constants.ts')
const normalizationModule = resolve(process.cwd(), 'src/lib/skills/normalize.ts')
const taxonomyImplemented = existsSync(constantsModule) && existsSync(normalizationModule)
const taxonomyTest = taxonomyImplemented ? test : test.todo

const expectedCategories = [
  'languages-web',
  'frontend',
  'backend-apis',
  'databases-caching',
  'messaging-async',
  'cloud-devops',
  'testing-quality',
  'security-identity',
  'ai-ml',
  'architecture-practices',
  'domain-platforms',
]

type ConstantsModule = {
  skillCategories: readonly string[]
  skillDecisions: readonly string[]
  skillMatchResults: readonly string[]
  skillOrigins: readonly string[]
  skillReviewStatuses: readonly string[]
}

type NormalizationModule = {
  normalizeSkillAlias: (value: string) => string
}

async function loadContracts() {
  return {
    constants: (await import(constantsModule)) as ConstantsModule,
    normalization: (await import(normalizationModule)) as NormalizationModule,
  }
}

describe('planned canonical skill taxonomy contract', () => {
  taxonomyTest('uses one predictable category vocabulary', async () => {
    const { constants } = await loadContracts()
    expect([...constants.skillCategories]).toEqual(expectedCategories)
  })

  taxonomyTest('keeps analysis states separate from user decisions', async () => {
    const { constants } = await loadContracts()
    expect([...constants.skillMatchResults]).toEqual(['proven-match', 'not-in-career-data'])
    expect([...constants.skillDecisions]).toEqual(['pending', 'skip', 'include'])
    expect(constants.skillDecisions).not.toContain('excluded')
  })

  taxonomyTest('defines review and origin states independently', async () => {
    const { constants } = await loadContracts()
    expect([...constants.skillReviewStatuses]).toEqual([
      'pending',
      'approved',
      'rejected',
      'merged',
    ])
    expect([...constants.skillOrigins]).toEqual(['career-data', 'job-parser', 'manual', 'import'])
  })

  taxonomyTest('normalizes spelling without erasing meaningful punctuation', async () => {
    const { normalization } = await loadContracts()

    expect(normalization.normalizeSkillAlias('  Node.JS  ')).toBe('node.js')
    expect(normalization.normalizeSkillAlias('Node   JS')).toBe('node js')
    expect(normalization.normalizeSkillAlias('ＴｙｐｅＳｃｒｉｐｔ')).toBe('typescript')

    const cFamily = ['C', 'C++', 'C#'].map(normalization.normalizeSkillAlias)
    expect(new Set(cFamily).size).toBe(3)
    expect(normalization.normalizeSkillAlias('.NET')).not.toBe(
      normalization.normalizeSkillAlias('net'),
    )
  })
})
