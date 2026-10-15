import { describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

/**
 * runtime-read acceptance runs in an isolated child process.
 *
 * Several UI suites register process-global `mock.module` replacements for the
 * very modules this acceptance exercises (`src/db/queries`, `src/lib/directions`,
 * `src/lib/candidate-analysis`, `src/lib/generation-queue`). Those mocks leak
 * across test files, so running these cases in the same process as the UI suite
 * would assert against stubs rather than the database-backed runtime. The child
 * gets its own temporary `DB_FILE_NAME`, so it is fully isolated in both
 * directions.
 */
describe('database-owned runtime career reads (isolated process)', () => {
  test('passes every acceptance case', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'job-tracker-runtime-reads-'))
    try {
      const result = Bun.spawnSync({
        cmd: ['bun', 'test', './tests/career/runtime-reads.cases.ts'],
        cwd: process.cwd(),
        env: {
          ...process.env,
          DB_FILE_NAME: resolve(root, 'jobs.db'),
          BUNQUEUE_DATA_PATH: resolve(root, 'queue.db'),
          CAREER_BASE_RESUMES_DIR: resolve(root, 'base-resumes'),
        },
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const output = `${result.stdout?.toString() ?? ''}\n${result.stderr?.toString() ?? ''}`
      expect(result.exitCode, output).toBe(0)
      expect(output).toContain('0 fail')
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })
})
