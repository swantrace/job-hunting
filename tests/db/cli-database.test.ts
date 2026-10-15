import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { cliDatabaseFlag, resolveCliDatabasePath } from '../../src/db/cli-database'

/**
 * Step 12 hardening: a CLI must never silently open the repository default
 * `./jobs.db`. Importing `src/db/client.ts` opens (and can checkpoint) whatever
 * `DB_FILE_NAME` points at, so every CLI entrypoint resolves an explicit
 * database first. These tests never open a database: the guard module itself has
 * no database imports.
 */

describe('CLI database selection guard', () => {
  test('uses an explicit --database value, trimmed', () => {
    expect(resolveCliDatabasePath('/tmp/explicit.db', {})).toBe('/tmp/explicit.db')
    expect(resolveCliDatabasePath('  /tmp/spaced.db  ', {})).toBe('/tmp/spaced.db')
  })

  test('falls back to DB_FILE_NAME', () => {
    expect(resolveCliDatabasePath(undefined, { DB_FILE_NAME: '/tmp/env.db' })).toBe('/tmp/env.db')
    expect(resolveCliDatabasePath('   ', { DB_FILE_NAME: '  /tmp/env.db ' })).toBe('/tmp/env.db')
  })

  test('prefers the explicit value over DB_FILE_NAME', () => {
    expect(resolveCliDatabasePath('/tmp/explicit.db', { DB_FILE_NAME: '/tmp/env.db' })).toBe(
      '/tmp/explicit.db',
    )
  })

  test('fails loudly rather than falling back to ./jobs.db', () => {
    let message = ''
    try {
      resolveCliDatabasePath(undefined, {})
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    expect(message).toContain('--database')
    expect(message).toContain('DB_FILE_NAME')
    expect(message).toContain('./jobs.db')
    expect(message).toMatch(/production/)
  })

  test('reads --database from raw arguments', () => {
    expect(cliDatabaseFlag(['--apply', '--database', '/tmp/x.db'])).toBe('/tmp/x.db')
    expect(cliDatabaseFlag(['--direction', 'fullstack'])).toBeUndefined()
    expect(() => cliDatabaseFlag(['--database'])).toThrow('--database requires a path value')
    expect(() => cliDatabaseFlag(['--database', '--apply'])).toThrow(
      '--database requires a path value',
    )
  })
})

describe('CLI entrypoints import the guard before opening a database', () => {
  const guarded = [
    'audit-orphan-artifacts.ts',
    'audit-skills.ts',
    'export-career-data.ts',
    'export-chatgpt-career-context.ts',
    'import-base-resume.ts',
    'import-career-data.ts',
    'run-resume-experiment.ts',
    'sync-career-data-to-fly.ts',
    'sync-career-skills.ts',
    'sync-skill-taxonomy.ts',
  ]

  test('every guarded CLI imports src/db/cli-database first', () => {
    for (const file of guarded) {
      const source = readFileSync(resolve(process.cwd(), 'src/cli', file), 'utf8')
      const firstImport = source.split('\n').find((line) => line.startsWith('import '))
      expect(firstImport, file).toContain("'../db/cli-database'")
    }
  })

  test('the app server keeps its jobs.db default (the guard is CLI-only)', () => {
    const client = readFileSync(resolve(process.cwd(), 'src/db/client.ts'), 'utf8')
    expect(client).toContain("process.env.DB_FILE_NAME ?? 'jobs.db'")
  })
})

describe('the guard runs when the module is imported', () => {
  const modulePath = resolve(process.cwd(), 'src/db/cli-database.ts')

  function importGuard(env: Record<string, string | undefined>) {
    // Run outside the repository so Bun does not auto-load the developer's .env.
    const root = mkdtempSync(resolve(tmpdir(), 'job-tracker-cli-guard-'))
    try {
      const result = Bun.spawnSync({
        cmd: ['bun', '-e', `import ${JSON.stringify(modulePath)}`],
        cwd: root,
        env,
        stdout: 'pipe',
        stderr: 'pipe',
      })
      return {
        root,
        exitCode: result.exitCode,
        output: `${result.stdout?.toString() ?? ''}\n${result.stderr?.toString() ?? ''}`,
      }
    } catch (error) {
      rmSync(root, { force: true, recursive: true })
      throw error
    }
  }

  test('fails on import without --database or DB_FILE_NAME', () => {
    const env = { ...process.env }
    delete env.DB_FILE_NAME
    const { root, exitCode, output } = importGuard(env)
    try {
      expect(exitCode, output).not.toBe(0)
      expect(output).toContain('No database selected')
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  test('succeeds on import with an explicit database and opens nothing', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'job-tracker-cli-guard-ok-'))
    const databaseFile = resolve(root, 'jobs.db')
    try {
      const result = Bun.spawnSync({
        cmd: ['bun', '-e', `import ${JSON.stringify(modulePath)}`],
        cwd: root,
        env: { ...process.env, DB_FILE_NAME: databaseFile },
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const output = `${result.stdout?.toString() ?? ''}\n${result.stderr?.toString() ?? ''}`
      expect(result.exitCode, output).toBe(0)
      expect(output).not.toContain('No database selected')
      // Importing the guard only selects the path; it must never create a file.
      expect(existsSync(databaseFile)).toBe(false)
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })
})

describe('a real guarded CLI requires an explicit database', () => {
  /**
   * Runs a CLI with its working directory inside a temp root, so even a broken
   * guard could only ever open `<temp>/jobs.db`, never the repository's
   * `jobs.db`. The temp database is migrated first for the success case.
   */
  function runCli(script: string, root: string, args: string[]) {
    const env = { ...process.env }
    delete env.DB_FILE_NAME
    return Bun.spawnSync({
      cmd: ['bun', resolve(process.cwd(), script), ...args],
      cwd: root,
      env,
      stdout: 'pipe',
      stderr: 'pipe',
    })
  }

  test('fails loudly without --database, and honors --database when supplied', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'job-tracker-cli-db-'))
    const databaseFile = resolve(root, 'jobs.db')
    try {
      const sqlite = new Database(databaseFile, { create: true })
      try {
        sqlite.exec('PRAGMA foreign_keys = ON;')
        migrate(drizzle({ client: sqlite }), { migrationsFolder: './drizzle' })
      } finally {
        sqlite.close()
      }

      const missing = runCli('src/cli/export-career-data.ts', root, [])
      const missingOutput = `${missing.stdout?.toString() ?? ''}\n${missing.stderr?.toString() ?? ''}`
      expect(missing.exitCode, missingOutput).not.toBe(0)
      expect(missingOutput).toContain('No database selected')

      const outputFile = resolve(root, 'export.json')
      const explicit = runCli('src/cli/export-career-data.ts', root, [
        '--database',
        databaseFile,
        '--out',
        outputFile,
      ])
      const explicitOutput = `${explicit.stdout?.toString() ?? ''}\n${explicit.stderr?.toString() ?? ''}`
      expect(explicit.exitCode, explicitOutput).toBe(0)
      expect(existsSync(outputFile)).toBe(true)
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })
})
