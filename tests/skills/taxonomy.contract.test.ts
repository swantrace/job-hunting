import { describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const taxonomyModule = resolve(process.cwd(), 'src/lib/skills/taxonomy.ts')
const normalizationModule = resolve(process.cwd(), 'src/lib/skills/normalize.ts')
const taxonomyImplemented = existsSync(taxonomyModule) && existsSync(normalizationModule)
const taxonomyTest = taxonomyImplemented ? test : test.todo

type WorkflowConstantsModule = {
  skillDecisions: readonly string[]
  skillMatchResults: readonly string[]
  skillOrigins: readonly string[]
  skillReviewStatuses: readonly string[]
}

type TaxonomyModule = {
  loadSkillTaxonomy: () => {
    schemaVersion: 1
    categories: Array<{ key: string; label: string; sortOrder: number }>
  }
  skillCategoryDefinitions: () => Array<{ key: string; label: string; sortOrder: number }>
}

type NormalizationModule = {
  normalizeSkillAlias: (value: string) => string
}

async function loadContracts() {
  return {
    constants: (await import(
      resolve(process.cwd(), 'src/lib/skills/constants.ts')
    )) as WorkflowConstantsModule,
    taxonomy: (await import(taxonomyModule)) as TaxonomyModule,
    normalization: (await import(normalizationModule)) as NormalizationModule,
  }
}

describe('planned canonical skill taxonomy contract', () => {
  taxonomyTest('uses one predictable category vocabulary', async () => {
    const { taxonomy } = await loadContracts()
    const previous = process.env.CAREER_DATA_DIR
    process.env.CAREER_DATA_DIR = resolve(process.cwd(), 'career-data.example')
    try {
      const categories = taxonomy.skillCategoryDefinitions()
      expect(categories.length).toBeGreaterThan(0)
      expect(new Set(categories.map((category) => category.key)).size).toBe(categories.length)
      expect(new Set(categories.map((category) => category.label)).size).toBe(categories.length)
      expect(new Set(categories.map((category) => category.sortOrder)).size).toBe(categories.length)
      expect(categories.map((category) => category.sortOrder)).toEqual(
        [...categories].map((category) => category.sortOrder).sort((left, right) => left - right),
      )
    } finally {
      if (previous === undefined) delete process.env.CAREER_DATA_DIR
      else process.env.CAREER_DATA_DIR = previous
    }
  })

  taxonomyTest('loads candidate-owned categories from CAREER_DATA_DIR', async () => {
    const { taxonomy } = await loadContracts()
    const directory = mkdtempSync(join(tmpdir(), 'job-tracker-taxonomy-'))
    const previous = process.env.CAREER_DATA_DIR
    writeFileSync(
      join(directory, 'skill-taxonomy.json'),
      JSON.stringify({
        schemaVersion: 1,
        categories: [{ key: 'candidate-specific', label: 'Candidate Specific', sortOrder: 7 }],
      }),
    )
    process.env.CAREER_DATA_DIR = directory
    try {
      expect(taxonomy.skillCategoryDefinitions()).toEqual([
        { key: 'candidate-specific', label: 'Candidate Specific', sortOrder: 7 },
      ])
    } finally {
      if (previous === undefined) delete process.env.CAREER_DATA_DIR
      else process.env.CAREER_DATA_DIR = previous
      rmSync(directory, { recursive: true, force: true })
    }
  })

  taxonomyTest(
    'uses the example taxonomy when the configured private directory is absent',
    async () => {
      const { taxonomy } = await loadContracts()
      const previous = process.env.CAREER_DATA_DIR
      process.env.CAREER_DATA_DIR = `missing-career-data-${crypto.randomUUID()}`
      try {
        expect(taxonomy.skillCategoryDefinitions().length).toBeGreaterThan(0)
      } finally {
        if (previous === undefined) delete process.env.CAREER_DATA_DIR
        else process.env.CAREER_DATA_DIR = previous
      }
    },
  )

  taxonomyTest('rejects an existing career-data directory without a taxonomy', async () => {
    const { taxonomy } = await loadContracts()
    const directory = mkdtempSync(join(tmpdir(), 'job-tracker-taxonomy-missing-'))
    const previous = process.env.CAREER_DATA_DIR
    process.env.CAREER_DATA_DIR = directory
    try {
      expect(() => taxonomy.loadSkillTaxonomy()).toThrow('Add skill-taxonomy.json')
    } finally {
      if (previous === undefined) delete process.env.CAREER_DATA_DIR
      else process.env.CAREER_DATA_DIR = previous
      rmSync(directory, { recursive: true, force: true })
    }
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
