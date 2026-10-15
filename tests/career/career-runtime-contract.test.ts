import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { loadCareerDataView } from '../../src/db/career-data-view'
import { assertDatabaseReady } from '../../src/db/health'
import * as schema from '../../src/db/schema'
import { careerOnboardingRequired } from '../../src/lib/application-readiness'
import { loadCareerData } from '../../src/lib/career-data'
import { migratedDatabase } from '../support/sqlite'

/**
 * Runtime contract: `start` migrates the schema only, the retired file-sync and
 * one-off CLIs stay out of `package.json`, the import-only env vars are
 * documented and are not runtime requirements, and a fresh empty database boots
 * and renders onboarding without any career-data directory. Every database here
 * is a temporary migrated database; the owner's `jobs.db` is never touched.
 */

function repoFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

/** Run `body` with `CAREER_DATA_DIR` pointed at a directory that does not exist. */
function withMissingCareerDataDirectory<T>(body: () => T): T {
  const previous = process.env.CAREER_DATA_DIR
  process.env.CAREER_DATA_DIR = resolve(tmpdir(), `missing-career-data-${crypto.randomUUID()}`)
  try {
    return body()
  } finally {
    if (previous === undefined) delete process.env.CAREER_DATA_DIR
    else process.env.CAREER_DATA_DIR = previous
  }
}

describe('start migrates the schema only', () => {
  const scripts = (JSON.parse(repoFile('package.json')) as { scripts: Record<string, string> })
    .scripts

  test('start runs db:migrate and no script runs a file synchronizer', () => {
    expect(scripts.start).toContain('db:migrate')
    for (const script of Object.values(scripts)) {
      expect(script).not.toContain('taxonomy:sync')
      expect(script).not.toContain('skills:sync')
    }
  })

  test('the retired file-sync and one-off CLIs are gone', () => {
    // career export/import, Base Resume import and the ChatGPT context export are
    // browser flows under /career-data/transfer; nothing may reintroduce a CLI.
    for (const name of [
      'setup',
      'db:generate',
      'career:import',
      'career:export',
      'career:export-chatgpt-context',
      'resume:import',
      'resume:experiment',
      'fly:sync-career-data',
      'taxonomy:sync',
      'skills:sync',
      'skills:audit',
      'artifacts:audit',
      'test:unit',
      'test:skills',
      'test:ui-contracts',
    ])
      expect(scripts).not.toHaveProperty(name)
  })
})

describe('import-only env documentation', () => {
  const envExample = repoFile('.env.example')

  test('marks CAREER_DATA_DIR and CAREER_BASE_RESUMES_DIR import-only', () => {
    expect(envExample).toMatch(/import-only/i)
    for (const name of ['CAREER_DATA_DIR', 'CAREER_BASE_RESUMES_DIR'])
      expect(envExample).toMatch(new RegExp(`^${name}=$`, 'm'))
    // The old runtime default (a directory the app implicitly read) is gone.
    expect(envExample).not.toMatch(/^CAREER_DATA_DIR=career-data$/m)
  })

  test('the README documents them as optional import-only inputs, not runtime', () => {
    const readme = repoFile('README.md')
    expect(readme).toMatch(/import-only/i)
    expect(readme).toContain('CAREER_DATA_DIR')
    expect(readme).toContain('CAREER_BASE_RESUMES_DIR')
    expect(readme).not.toContain('The runtime uses `career-data/` when present')
  })
})

describe('file-free restart on a fresh database', () => {
  test('boots with no career-data directory, reports onboarding and does not crash', () => {
    withMissingCareerDataDirectory(() => {
      const sqlite = migratedDatabase()
      try {
        expect(() => assertDatabaseReady(sqlite)).not.toThrow()
        const executor = drizzle({ client: sqlite, schema })
        expect(careerOnboardingRequired(executor)).toBe(true)
        expect(loadCareerDataView(executor).onboardingRequired).toBe(true)

        const data = loadCareerData(executor)
        expect(data.preferences.directionDefinitions).toEqual({})
        expect(data.skills.skills).toEqual([])
        expect(data.experiences.experiences).toEqual([])
      } finally {
        sqlite.close()
      }
    })
  })
})
