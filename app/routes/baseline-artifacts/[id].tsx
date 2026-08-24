import { readFile } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import { createRoute } from 'honox/factory'
import { getBaselineArtifact } from '../../../src/db/generation'
import { getArtifactsRoot } from '../../../src/lib/artifact-storage'
import { parseId } from '../../../src/lib/request'

export default createRoute(async (c) => {
  const id = parseId(c.req.param('id'))
  const row = id ? getBaselineArtifact(id) : null
  if (!row) return c.text('Artifact not found.', 404)
  const root = resolve(getArtifactsRoot())
  const path = resolve(root, row.artifact.filePath)
  if (relative(root, path).startsWith(`..${sep}`)) return c.text('Invalid artifact path.', 400)
  return c.body(await readFile(path), 200, {
    'Content-Type': row.artifact.mimeType,
    'Content-Disposition': `attachment; filename="${row.artifact.fileName}"`,
  })
})
