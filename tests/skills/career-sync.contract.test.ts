import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

const projectRoot = process.cwd()
const cliPath = resolve(projectRoot, 'src/cli/sync-career-skills.ts')
const syncTest = existsSync(cliPath) ? test : test.todo

type SyncFixture = {
  careerDataDir: string
  databaseFile: string
  root: string
}

function createFixture(): SyncFixture {
  const root = mkdtempSync(resolve(tmpdir(), 'job-tracker-skill-sync-'))
  const careerDataDir = resolve(root, 'career-data')
  const databaseFile = resolve(root, 'jobs.db')
  cpSync(resolve(projectRoot, 'career-data.example'), careerDataDir, { recursive: true })

  const skillsPath = resolve(careerDataDir, 'skills.json')
  const skills = JSON.parse(readFileSync(skillsPath, 'utf8')) as {
    skills: Array<Record<string, unknown>>
  }
  for (const skill of skills.skills) {
    skill.category = skill.id === 'fhir' ? 'domain-platforms' : 'languages-web'
    skill.aliases = skill.id === 'fhir' ? ['HL7 FHIR'] : ['TS']
  }
  writeFileSync(skillsPath, `${JSON.stringify(skills, null, 2)}\n`)
  return { careerDataDir, databaseFile, root }
}

function run(command: string[], fixture: SyncFixture) {
  return Bun.spawnSync({
    cmd: ['bun', 'run', ...command],
    cwd: projectRoot,
    env: {
      ...process.env,
      CAREER_DATA_DIR: fixture.careerDataDir,
      DB_FILE_NAME: fixture.databaseFile,
    },
    stderr: 'pipe',
    stdout: 'pipe',
  })
}

function expectSuccess(result: ReturnType<typeof Bun.spawnSync>) {
  expect(result.exitCode, result.stderr?.toString() ?? 'Command failed without stderr.').toBe(0)
}

describe('planned career skill synchronization CLI contract', () => {
  syncTest('loads career skills and aliases idempotently', () => {
    const fixture = createFixture()
    try {
      expectSuccess(run(['src/db/migrate.ts'], fixture))
      expectSuccess(run(['src/cli/sync-career-skills.ts', '--apply'], fixture))
      expectSuccess(run(['src/cli/sync-career-skills.ts', '--apply'], fixture))

      const sqlite = new Database(fixture.databaseFile, { readonly: true })
      const skills = sqlite
        .query(
          `SELECT key, name, category, review_status, origin
           FROM skills
           ORDER BY key`,
        )
        .all() as Array<Record<string, unknown>>
      const aliases = sqlite
        .query('SELECT alias, normalized_alias FROM skill_aliases ORDER BY normalized_alias')
        .all() as Array<Record<string, unknown>>

      expect(skills).toHaveLength(2)
      expect(skills).toContainEqual(
        expect.objectContaining({
          key: 'typescript',
          origin: 'career-data',
          category: 'languages-web',
          name: 'TypeScript',
          review_status: 'approved',
        }),
      )
      expect(aliases).toContainEqual(
        expect.objectContaining({ alias: 'TS', normalized_alias: 'ts' }),
      )
      expect(new Set(aliases.map((item) => item.normalized_alias)).size).toBe(aliases.length)
      sqlite.close()
    } finally {
      rmSync(fixture.root, { force: true, recursive: true })
    }
  })

  syncTest('keeps dry-run non-mutating', () => {
    const fixture = createFixture()
    try {
      expectSuccess(run(['src/db/migrate.ts'], fixture))
      expectSuccess(run(['src/cli/sync-career-skills.ts', '--dry-run'], fixture))

      const sqlite = new Database(fixture.databaseFile, { readonly: true })
      const count = sqlite.query('SELECT count(*) AS count FROM skills').get() as { count: number }
      expect(count.count).toBe(0)
      sqlite.close()
    } finally {
      rmSync(fixture.root, { force: true, recursive: true })
    }
  })

  syncTest('does not copy private evidence fields into taxonomy tables', () => {
    const fixture = createFixture()
    try {
      expectSuccess(run(['src/db/migrate.ts'], fixture))
      expectSuccess(run(['src/cli/sync-career-skills.ts', '--apply'], fixture))

      const sqlite = new Database(fixture.databaseFile, { readonly: true })
      const columns = sqlite
        .query("SELECT name FROM pragma_table_info('skills')")
        .all()
        .map((row) => String((row as { name: string }).name))

      for (const privateField of [
        'evidence',
        'level',
        'last_used',
        'resume_eligible',
        'directions',
      ]) {
        expect(columns).not.toContain(privateField)
      }
      sqlite.close()
    } finally {
      rmSync(fixture.root, { force: true, recursive: true })
    }
  })

  syncTest('skips gracefully with --if-present when career data fails validation', () => {
    const fixture = createFixture()
    try {
      const skillsPath = resolve(fixture.careerDataDir, 'skills.json')
      writeFileSync(
        skillsPath,
        `${JSON.stringify(
          {
            schemaVersion: 1,
            lastUpdated: '2026-08-05',
            skills: [
              {
                id: 'typescript',
                label: 'TypeScript',
                category: 'miscellaneous',
                aliases: [],
                directions: ['fullstack'],
              },
            ],
          },
          null,
          2,
        )}\n`,
      )

      expectSuccess(run(['src/db/migrate.ts'], fixture))
      const result = run(['src/cli/sync-career-skills.ts', '--if-present', '--apply'], fixture)
      expect(result.exitCode).toBe(0)

      const sqlite = new Database(fixture.databaseFile, { readonly: true })
      const count = sqlite.query('SELECT count(*) AS count FROM skills').get() as { count: number }
      expect(count.count).toBe(0)
      sqlite.close()
    } finally {
      rmSync(fixture.root, { force: true, recursive: true })
    }
  })
})
