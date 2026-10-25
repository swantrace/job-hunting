import { expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

if (process.env.EXTENSION_INTAKE_ISOLATED === '1') {
  await import('./support/extension-intake-cases')
} else {
  test('extension intake contracts, persistence and Engine pipeline', () => {
    const root = mkdtempSync(join(tmpdir(), 'extension-intake-'))
    try {
      const child = Bun.spawnSync([process.execPath, 'test', import.meta.path], {
        env: {
          ...process.env,
          EXTENSION_INTAKE_ISOLATED: '1',
          DB_FILE_NAME: join(root, 'jobs.db'),
          QUEUE_FILE_NAME: join(root, 'queue.db'),
        },
        stdout: 'pipe',
        stderr: 'pipe',
      })
      if (child.exitCode !== 0) throw new Error(new TextDecoder().decode(child.stderr))
      expect(child.exitCode).toBe(0)
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  }, 15000)
}
