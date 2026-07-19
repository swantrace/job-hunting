import { readFile } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import { createRoute } from 'honox/factory'
import { getGenerationEvidenceSnapshot } from '../../../src/db/generation'
import { getArtifactsRoot } from '../../../src/lib/artifact-storage'
import { parseId } from '../../../src/lib/request'

export default createRoute(async (c) => {
  const runId = parseId(c.req.param('runId'))
  const snapshot = runId ? getGenerationEvidenceSnapshot(runId) : null
  if (!snapshot) return c.text('Evidence snapshot not found.', 404)
  const root = resolve(getArtifactsRoot())
  const filePath = resolve(root, snapshot.filePath)
  if (relative(root, filePath).startsWith(`..${sep}`) || relative(root, filePath) === '..')
    return c.text('Evidence snapshot not found.', 404)
  try {
    return new Response(await readFile(filePath), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="evidence-selection-run-${runId}.json"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch {
    return c.text('Evidence snapshot file is unavailable.', 404)
  }
})
