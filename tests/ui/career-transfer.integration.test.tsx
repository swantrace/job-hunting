import { describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

/**
 * career transfer route acceptance runs in an isolated child process.
 *
 * The transfer routes resolve the `db` singleton at import time, so the suite
 * cannot swap in a temporary database from the parent process. The child gets its
 * own `DB_FILE_NAME` and resets the career rows between cases, exactly like the
 * runtime-read acceptance, which also keeps the developer's `jobs.db` out
 * of the run.
 */
describe('database-owned career import/export UI (isolated process)', () => {
  test('passes every career transfer acceptance case', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'job-tracker-step11-'))
    try {
      const result = Bun.spawnSync({
        cmd: ['bun', 'test', './tests/ui/career-transfer.cases.tsx'],
        cwd: process.cwd(),
        env: {
          ...process.env,
          BUNQUEUE_DATA_PATH: resolve(root, 'queue.db'),
          DB_FILE_NAME: resolve(root, 'jobs.db'),
        },
        stderr: 'pipe',
        stdout: 'pipe',
      })
      const output = `${result.stdout?.toString() ?? ''}\n${result.stderr?.toString() ?? ''}`
      expect(result.exitCode, output).toBe(0)
      expect(output).toContain('0 fail')
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })
})
