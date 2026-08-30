import { createRoute } from 'honox/factory'
import { getGenerationEvidenceSnapshot } from '../../../src/db/generation'
import { parseId } from '../../../src/lib/request'

export default createRoute((c) => {
  const runId = parseId(c.req.param('runId'))
  const snapshot = runId ? getGenerationEvidenceSnapshot(runId) : null
  if (!snapshot) return c.text('Evidence snapshot not found.', 404)
  // Snapshot JSON is database-authoritative; no duplicate on-disk file is read.
  return new Response(snapshot.snapshotJson, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="evidence-selection-run-${runId}.json"`,
      'Cache-Control': 'no-store',
    },
  })
})
